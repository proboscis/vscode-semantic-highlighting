//! Hy source analysis (including the doeff-hy definition macros).
//!
//! The reader turns Hy source into forms while tolerating unbalanced brackets (the file is
//! usually mid-edit), and the analyzer walks the forms to emit the same symbol kinds as the
//! Python analyzer, so the extension colors both languages through one path.

use std::collections::HashSet;

use super::{HighlighterOutput, LineIndex, SymbolCollector, SymbolKind};

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
struct Span {
    start: usize,
    end: usize,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Delim {
    Paren,
    Bracket,
    Brace,
    Tuple,
    Set,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum StrKind {
    Plain,
    Format,
    Raw,
    Bytes,
    Bracket,
    FormatBracket,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum Prefix {
    Quote,
    Quasiquote,
    Unquote,
    UnquoteSplice,
    Unpack,
    UnpackMapping,
}

#[derive(Debug)]
enum Form {
    Seq { delim: Delim, items: Vec<Form> },
    Symbol(Span),
    Keyword(Span),
    Str { kind: StrKind, span: Span, body: Span },
    Number,
    Prefixed { prefix: Prefix, inner: Option<Box<Form>> },
    Annotated { annotation: Option<Box<Form>>, target: Option<Box<Form>> },
    Discarded(Span),
    Tagged { inner: Option<Box<Form>> },
}

impl Form {
    fn paren_items(&self) -> Option<&[Form]> {
        match self {
            Form::Seq { delim: Delim::Paren, items } => Some(items),
            _ => None,
        }
    }

    fn bracket_items(&self) -> Option<&[Form]> {
        match self {
            Form::Seq { delim: Delim::Bracket, items } => Some(items),
            _ => None,
        }
    }

    fn is_brace(&self) -> bool {
        matches!(self, Form::Seq { delim: Delim::Brace, .. })
    }
}

// ---------------------------------------------------------------------------------------------
// Reader
// ---------------------------------------------------------------------------------------------

struct Reader<'a> {
    src: &'a str,
    bytes: &'a [u8],
    pos: usize,
    end: usize,
    comments: Vec<Span>,
}

fn is_delimiter(b: u8) -> bool {
    b.is_ascii_whitespace() || matches!(b, b'(' | b')' | b'[' | b']' | b'{' | b'}' | b'"' | b';')
}

fn is_closer(b: u8) -> bool {
    matches!(b, b')' | b']' | b'}')
}

impl<'a> Reader<'a> {
    fn new(src: &'a str, start: usize, end: usize) -> Self {
        Reader { src, bytes: src.as_bytes(), pos: start, end, comments: Vec::new() }
    }

    fn peek(&self, offset: usize) -> Option<u8> {
        let at = self.pos + offset;
        if at < self.end {
            Some(self.bytes[at])
        } else {
            None
        }
    }

    fn read_all(&mut self) -> Vec<Form> {
        let mut forms = Vec::new();
        if self.src[self.pos..self.end].starts_with("#!") {
            self.skip_line_comment();
        }
        loop {
            self.skip_trivia();
            match self.peek(0) {
                None => break,
                // A stray closer at top level (mid-edit) is skipped.
                Some(b) if is_closer(b) => self.pos += 1,
                Some(_) => {
                    if let Some(form) = self.read_form() {
                        forms.push(form);
                    }
                }
            }
        }
        forms
    }

    fn skip_line_comment(&mut self) {
        let start = self.pos;
        while self.pos < self.end && self.bytes[self.pos] != b'\n' {
            self.pos += 1;
        }
        self.comments.push(Span { start, end: self.pos });
    }

    fn skip_trivia(&mut self) {
        while let Some(b) = self.peek(0) {
            if b == b';' {
                self.skip_line_comment();
            } else if b.is_ascii_whitespace() {
                self.pos += 1;
            } else {
                break;
            }
        }
    }

    /// Reads one form. Returns None at the end of input or at a closing bracket (not consumed).
    fn read_form(&mut self) -> Option<Form> {
        self.skip_trivia();
        let start = self.pos;
        let b = self.peek(0)?;
        match b {
            b'(' => Some(self.read_seq(Delim::Paren, 1, b')')),
            b'[' => Some(self.read_seq(Delim::Bracket, 1, b']')),
            b'{' => Some(self.read_seq(Delim::Brace, 1, b'}')),
            b')' | b']' | b'}' => None,
            b'"' => Some(self.read_string(start, start, StrKind::Plain)),
            b'\'' => Some(self.read_prefixed(Prefix::Quote, 1)),
            b'`' => Some(self.read_prefixed(Prefix::Quasiquote, 1)),
            b'~' => {
                if self.peek(1) == Some(b'@') {
                    Some(self.read_prefixed(Prefix::UnquoteSplice, 2))
                } else {
                    Some(self.read_prefixed(Prefix::Unquote, 1))
                }
            }
            b'#' => Some(self.read_dispatch(start)),
            _ => Some(self.read_atom()),
        }
    }

    fn read_seq(&mut self, delim: Delim, open_len: usize, close: u8) -> Form {
        self.pos += open_len;
        let mut items = Vec::new();
        loop {
            self.skip_trivia();
            match self.peek(0) {
                None => break,
                Some(b) if b == close => {
                    self.pos += 1;
                    break;
                }
                // A mismatched closer ends this sequence (best effort while editing).
                Some(b) if is_closer(b) => {
                    self.pos += 1;
                    break;
                }
                Some(_) => {
                    if let Some(form) = self.read_form() {
                        items.push(form);
                    }
                }
            }
        }
        Form::Seq { delim, items }
    }

    fn read_prefixed(&mut self, prefix: Prefix, len: usize) -> Form {
        self.pos += len;
        let inner = self.read_form().map(Box::new);
        Form::Prefixed { prefix, inner }
    }

    fn read_dispatch(&mut self, start: usize) -> Form {
        match self.peek(1) {
            Some(b'(') => self.read_seq(Delim::Tuple, 2, b')'),
            Some(b'{') => self.read_seq(Delim::Set, 2, b'}'),
            Some(b'[') => self.read_bracket_string(start),
            Some(b'*') => {
                if self.peek(2) == Some(b'*') {
                    self.read_prefixed(Prefix::UnpackMapping, 3)
                } else {
                    self.read_prefixed(Prefix::Unpack, 2)
                }
            }
            Some(b'^') => {
                self.pos += 2;
                let annotation = self.read_form().map(Box::new);
                let target = self.read_form().map(Box::new);
                Form::Annotated { annotation, target }
            }
            Some(b'_') => {
                self.pos += 2;
                self.read_form();
                Form::Discarded(Span { start, end: self.pos })
            }
            _ => {
                // Reader macro tag: #tag form
                self.pos += 1;
                while let Some(b) = self.peek(0) {
                    if is_delimiter(b) {
                        break;
                    }
                    self.pos += 1;
                }
                let inner = self.read_form().map(Box::new);
                Form::Tagged { inner }
            }
        }
    }

    fn read_bracket_string(&mut self, start: usize) -> Form {
        // #[delim[ ... ]delim]
        let delim_start = start + 2;
        let mut cursor = delim_start;
        while cursor < self.end && self.bytes[cursor] != b'[' && !self.bytes[cursor].is_ascii_whitespace() {
            cursor += 1;
        }
        if cursor >= self.end || self.bytes[cursor] != b'[' {
            // Not a bracket string; read it as a tagged form.
            self.pos = start + 1;
            let inner = self.read_form().map(Box::new);
            return Form::Tagged { inner };
        }
        let delim = &self.src[delim_start..cursor];
        let body_start = cursor + 1;
        let closing = format!("]{}]", delim);
        let (body_end, end) = match self.src[body_start..self.end].find(&closing) {
            Some(found) => (body_start + found, body_start + found + closing.len()),
            None => (self.end, self.end),
        };
        self.pos = end;
        let kind = if delim.starts_with('f') { StrKind::FormatBracket } else { StrKind::Bracket };
        Form::Str { kind, span: Span { start, end }, body: Span { start: body_start, end: body_end } }
    }

    fn read_string(&mut self, start: usize, quote: usize, kind: StrKind) -> Form {
        self.pos = quote + 1;
        let mut body_end = self.end;
        while self.pos < self.end {
            match self.bytes[self.pos] {
                b'\\' => self.pos += 2,
                b'"' => {
                    body_end = self.pos;
                    self.pos += 1;
                    break;
                }
                _ => self.pos += 1,
            }
        }
        self.pos = self.pos.min(self.end);
        Form::Str {
            kind,
            span: Span { start, end: self.pos },
            body: Span { start: quote + 1, end: body_end.min(self.end) },
        }
    }

    fn read_atom(&mut self) -> Form {
        let start = self.pos;
        while let Some(b) = self.peek(0) {
            if is_delimiter(b) {
                break;
            }
            self.pos += 1;
        }
        let text = &self.src[start..self.pos];
        if self.peek(0) == Some(b'"') {
            let kind = match text.to_ascii_lowercase().as_str() {
                "f" | "fr" | "rf" => Some(StrKind::Format),
                "r" => Some(StrKind::Raw),
                "b" | "br" | "rb" => Some(StrKind::Bytes),
                _ => None,
            };
            if let Some(kind) = kind {
                return self.read_string(start, self.pos, kind);
            }
        }
        let span = Span { start, end: self.pos };
        if text.len() > 1 && text.starts_with(':') {
            Form::Keyword(span)
        } else if is_number(text) {
            Form::Number
        } else {
            Form::Symbol(span)
        }
    }
}

fn is_number(text: &str) -> bool {
    let mut chars = text.chars();
    match chars.next() {
        Some(c) if c.is_ascii_digit() => true,
        Some('+' | '-' | '.') => chars.next().map_or(false, |c| c.is_ascii_digit()),
        _ => false,
    }
}

// ---------------------------------------------------------------------------------------------
// Vocabulary
// ---------------------------------------------------------------------------------------------

/// Hy special forms and core macros: always keywords in head position.
const HY_KEYWORDS: &[&str] = &[
    "if", "when", "unless", "cond", "do", "while", "break", "continue", "return", "yield",
    "yield-from", "await", "and", "or", "not", "raise", "assert", "del", "global", "nonlocal",
    "quote", "quasiquote", "unquote", "unquote-splice", "eval-and-compile", "eval-when-compile",
    "py", "pys", "chainc", "annotate", "cut", "try", "except", "except*", "else", "finally", "in",
    "not-in", "is", "is-not", "setv", "setx", "let", "fn", "fn/a", "defn", "defn/a", "defclass",
    "defmacro", "defreader", "deftype", "for", "for/a", "lfor", "sfor", "gfor", "dfor", "with",
    "with/a", "import", "require", "match", "pragma", "export", "local-macros", "get-macro",
    "defmain", "->", "->>", "as->", "doto", "lif", "branch", "ecase", "case", "ncut", ".",
];

/// doeff-hy forms that are keywords wherever they appear (definitions and binding syntax).
const DOEFF_KEYWORDS: &[&str] = &[
    "defk", "deff", "defp", "defpp", "fnk", "do!", "<-", "<->", "for/do", "deftest", "defpipeline",
    "defmcp-tool", "set!", "defhandler", "resume", "with-handler", "defrecord", "defenum",
    "defworkflow", "defphase", "defadr", "defsemgrep", "law",
];

/// doeff-hy macros whose names are ordinary words: keywords only when the file requires them.
const DOEFF_REQUIRED_KEYWORDS: &[&str] = &[
    "val", "var", "lazy", "session", "handle", "traverse", "validate", "check", "parallel",
    "parallel-for", "loop", "time!", "random!", "pipeline", "agent!", "gate!", "workspace!",
    "merge!",
];

/// Keyword literals that are syntax rather than argument names.
const STRUCTURAL_KEYWORDS: &[&str] = &[
    ":as", ":if", ":do", ":setv", ":async", ":while", ":else", ":macros", ":readers", ":=",
];

const CONSTANTS: &[&str] = &["True", "False", "None", "...", "Ellipsis", "NotImplemented", "Inf", "NaN"];

fn mangle(name: &str) -> String {
    let has_word = name.chars().any(|c| c.is_alphanumeric() || c == '_');
    if has_word && name.contains('-') {
        let trimmed = name.trim_start_matches('-');
        let leading = &name[..name.len() - trimmed.len()];
        format!("{}{}", leading, trimmed.replace('-', "_"))
    } else {
        name.to_string()
    }
}

fn is_operator(text: &str) -> bool {
    !text.chars().any(|c| c.is_alphanumeric() || c == '_')
}

/// Collects the names brought in by `(require module [names])` anywhere in the file.
fn collect_required(forms: &[Form], src: &str, out: &mut HashSet<String>) {
    for form in forms {
        match form {
            Form::Seq { items, delim } => {
                if *delim == Delim::Paren {
                    if let Some(Form::Symbol(head)) = items.first() {
                        if &src[head.start..head.end] == "require" {
                            for item in &items[1..] {
                                if let Some(names) = item.bracket_items() {
                                    for name in names {
                                        if let Form::Symbol(span) = name {
                                            out.insert(src[span.start..span.end].to_string());
                                        }
                                    }
                                }
                            }
                            continue;
                        }
                    }
                }
                collect_required(items, src, out);
            }
            _ => {}
        }
    }
}

// ---------------------------------------------------------------------------------------------
// Analyzer
// ---------------------------------------------------------------------------------------------

struct HyAnalyzer<'a> {
    src: &'a str,
    out: SymbolCollector<'a>,
    keywords: HashSet<String>,
}

impl<'a> HyAnalyzer<'a> {
    fn text(&self, span: Span) -> &'a str {
        &self.src[span.start..span.end]
    }

    fn record(&mut self, name: &str, kind: SymbolKind, start: usize, end: usize) {
        if start >= end || end > self.src.len() {
            return;
        }
        let occurrence = self.out.occurrence_from_span(start, end);
        self.out.insert_occurrence(name, kind, occurrence);
    }

    /// Records a span that may cross lines as one occurrence per line (decorations are single-line).
    fn record_lines(&mut self, name: &str, kind: SymbolKind, start: usize, end: usize) {
        let mut line_start = start;
        let src = self.src;
        for (offset, _) in src[start..end].match_indices('\n') {
            let line_end = start + offset;
            self.record(name, kind, line_start, line_end);
            line_start = line_end + 1;
        }
        self.record(name, kind, line_start, end);
    }

    fn record_keyword(&mut self, span: Span) {
        let text = self.text(span);
        self.record(text, SymbolKind::Keyword, span.start, span.end);
    }

    fn is_keyword_head(&self, text: &str) -> bool {
        self.keywords.contains(text)
    }

    fn scoped_kind(&self, name: &str) -> SymbolKind {
        if self.out.is_parameter(name) {
            SymbolKind::Parameter
        } else {
            SymbolKind::Variable
        }
    }

    /// Splits a dotted symbol into (segment, start, end), skipping empty segments.
    fn segments(&self, span: Span) -> Vec<(&'a str, usize, usize)> {
        let text = self.text(span);
        let mut result = Vec::new();
        let mut offset = 0;
        for part in text.split('.') {
            if !part.is_empty() {
                let start = span.start + offset;
                result.push((part, start, start + part.len()));
            }
            offset += part.len() + 1;
        }
        result
    }

    // --- expressions -----------------------------------------------------------------------

    fn visit_all(&mut self, forms: &[Form]) {
        for form in forms {
            self.visit_expr(form);
        }
    }

    fn visit_expr(&mut self, form: &Form) {
        match form {
            Form::Seq { delim: Delim::Paren, items } => self.visit_list(items),
            Form::Seq { items, .. } => {
                for item in items {
                    self.visit_arg(item);
                }
            }
            Form::Symbol(span) => self.visit_symbol(*span, false),
            Form::Keyword(span) => self.visit_keyword_literal(*span),
            Form::Str { .. } => self.visit_string(form),
            Form::Number => {}
            Form::Prefixed { prefix, inner } => {
                if let Some(inner) = inner {
                    match prefix {
                        Prefix::Quote => self.visit_quoted(inner),
                        Prefix::Quasiquote => self.visit_quasiquoted(inner),
                        _ => self.visit_expr(inner),
                    }
                }
            }
            Form::Annotated { annotation, target } => {
                if let Some(annotation) = annotation {
                    self.visit_type(annotation);
                }
                if let Some(target) = target {
                    self.visit_expr(target);
                }
            }
            Form::Discarded(span) => self.record_lines("__comment__", SymbolKind::Comment, span.start, span.end),
            Form::Tagged { inner } => {
                if let Some(inner) = inner {
                    self.visit_expr(inner);
                }
            }
        }
    }

    fn visit_arg(&mut self, form: &Form) {
        match form {
            Form::Keyword(span) => self.visit_keyword_literal(*span),
            _ => self.visit_expr(form),
        }
    }

    fn visit_args(&mut self, forms: &[Form]) {
        for form in forms {
            self.visit_arg(form);
        }
    }

    fn visit_keyword_literal(&mut self, span: Span) {
        let text = self.text(span);
        if STRUCTURAL_KEYWORDS.contains(&text) {
            self.record(text, SymbolKind::Keyword, span.start, span.end);
        } else {
            let name = mangle(&text[1..]);
            self.record(&name, SymbolKind::KwargName, span.start, span.end);
        }
    }

    /// Records a symbol reference. `head` = the symbol is the operator of a call.
    fn visit_symbol(&mut self, span: Span, head: bool) {
        let text = self.text(span);
        if CONSTANTS.contains(&text) || is_operator(text) {
            return;
        }
        let segments = self.segments(span);
        let Some(last_index) = segments.len().checked_sub(1) else {
            return;
        };
        if text.starts_with('.') {
            // (.method obj) / .attr
            for (index, (part, start, end)) in segments.iter().enumerate() {
                let kind = if head && index == last_index { SymbolKind::MethodCall } else { SymbolKind::Attribute };
                self.record(&mangle(part), kind, *start, *end);
            }
            return;
        }
        for (index, (part, start, end)) in segments.iter().enumerate() {
            let name = mangle(part);
            let kind = if index == 0 {
                if head && last_index == 0 {
                    SymbolKind::FunctionCall
                } else {
                    self.scoped_kind(&name)
                }
            } else if head && index == last_index {
                SymbolKind::MethodCall
            } else {
                SymbolKind::Attribute
            };
            self.record(&name, kind, *start, *end);
        }
    }

    fn visit_quoted(&mut self, form: &Form) {
        match form {
            Form::Seq { items, .. } => {
                for item in items {
                    self.visit_quoted(item);
                }
            }
            Form::Str { .. } => self.visit_string(form),
            Form::Prefixed { inner: Some(inner), .. } => self.visit_quoted(inner),
            _ => {}
        }
    }

    fn visit_quasiquoted(&mut self, form: &Form) {
        match form {
            Form::Seq { items, .. } => {
                for item in items {
                    self.visit_quasiquoted(item);
                }
            }
            Form::Str { .. } => self.visit_string(form),
            Form::Prefixed { prefix: Prefix::Unquote | Prefix::UnquoteSplice, inner: Some(inner) } => {
                self.visit_expr(inner)
            }
            Form::Prefixed { inner: Some(inner), .. } => self.visit_quasiquoted(inner),
            _ => {}
        }
    }

    fn visit_string(&mut self, form: &Form) {
        let Form::Str { kind, span, body } = form else {
            return;
        };
        let symbol_kind = match kind {
            StrKind::Plain => SymbolKind::String,
            StrKind::Raw | StrKind::Bracket => SymbolKind::RawString,
            StrKind::Bytes => SymbolKind::ByteString,
            StrKind::Format | StrKind::FormatBracket => {
                self.visit_fstring(*span, *body);
                return;
            }
        };
        self.record_lines("__string__", symbol_kind, span.start, span.end);
    }

    /// Colors the literal pieces of an f-string and analyzes each `{form}` inside it.
    fn visit_fstring(&mut self, span: Span, body: Span) {
        let bytes = self.src.as_bytes();
        let mut piece_start = span.start;
        let mut i = body.start;
        while i < body.end {
            match bytes[i] {
                b'{' if i + 1 < body.end && bytes[i + 1] == b'{' => i += 2,
                b'{' => {
                    let close = matching_brace(bytes, i, body.end);
                    self.record_lines("__string__", SymbolKind::Fstring, piece_start, i + 1);
                    let mut reader = Reader::new(self.src, i + 1, close);
                    if let Some(inner) = reader.read_form() {
                        self.visit_expr(&inner);
                    }
                    piece_start = close;
                    i = close + 1;
                }
                _ => i += 1,
            }
        }
        self.record_lines("__string__", SymbolKind::Fstring, piece_start.min(span.end), span.end);
    }

    fn visit_body(&mut self, forms: &[Form]) {
        self.visit_body_with(forms, false);
    }

    /// Visits a definition body, marking a leading string as a docstring. Contract maps
    /// (`{:pre … :post …}` of defk) may precede it. `lone_doc` = a lone string is still a docstring.
    fn visit_body_with(&mut self, forms: &[Form], lone_doc: bool) {
        let mut index = 0;
        while index < forms.len() && forms[index].is_brace() {
            self.visit_expr(&forms[index]);
            index += 1;
        }
        if let Some(Form::Str { kind: StrKind::Plain, span, .. }) = forms.get(index) {
            if lone_doc || index + 1 < forms.len() {
                self.record_lines("__docstring__", SymbolKind::Docstring, span.start, span.end);
                index += 1;
            }
        }
        for form in &forms[index..] {
            self.visit_expr(form);
        }
    }

    // --- types, targets, parameters --------------------------------------------------------

    fn visit_type(&mut self, form: &Form) {
        match form {
            Form::Symbol(span) => {
                let text = self.text(*span);
                if CONSTANTS.contains(&text) || is_operator(text) {
                    return;
                }
                for (part, start, end) in self.segments(*span) {
                    self.record(&mangle(part), SymbolKind::TypeAnnotation, start, end);
                }
            }
            Form::Seq { delim: Delim::Paren, items } => {
                let rest = match items.first() {
                    Some(Form::Symbol(head)) if is_operator(self.text(*head)) => &items[1..],
                    Some(Form::Symbol(head)) if matches!(self.text(*head), "get" | "of") => {
                        self.record_keyword(*head);
                        &items[1..]
                    }
                    _ => &items[..],
                };
                for item in rest {
                    self.visit_type(item);
                }
            }
            Form::Seq { items, .. } => {
                for item in items {
                    self.visit_type(item);
                }
            }
            Form::Str { .. } => self.visit_string(form),
            Form::Number => {}
            _ => self.visit_expr(form),
        }
    }

    fn visit_target(&mut self, form: &Form) {
        match form {
            Form::Symbol(span) => {
                let text = self.text(*span);
                if text.contains('.') {
                    self.visit_symbol(*span, false);
                } else if !is_operator(text) {
                    let name = mangle(text);
                    let kind = self.scoped_kind(&name);
                    self.record(&name, kind, span.start, span.end);
                }
            }
            Form::Annotated { annotation, target } => {
                if let Some(annotation) = annotation {
                    self.visit_type(annotation);
                }
                if let Some(target) = target {
                    self.visit_target(target);
                }
            }
            Form::Seq { delim: Delim::Bracket | Delim::Tuple, items } => {
                for item in items {
                    self.visit_target(item);
                }
            }
            Form::Prefixed { prefix: Prefix::Unpack | Prefix::UnpackMapping, inner: Some(inner) } => {
                self.visit_target(inner)
            }
            _ => self.visit_expr(form),
        }
    }

    fn visit_pairs(&mut self, forms: &[Form]) {
        for pair in forms.chunks(2) {
            self.visit_target(&pair[0]);
            if let Some(value) = pair.get(1) {
                self.visit_expr(value);
            }
        }
    }

    fn visit_params(&mut self, forms: &[Form]) {
        for form in forms {
            self.visit_param(form);
        }
    }

    fn visit_param(&mut self, form: &Form) {
        match form {
            Form::Symbol(span) => {
                let text = self.text(*span);
                if is_operator(text) {
                    return;
                }
                let name = mangle(text);
                self.out.add_param_to_scope(&name);
                self.record(&name, SymbolKind::Parameter, span.start, span.end);
            }
            Form::Annotated { annotation, target } => {
                if let Some(annotation) = annotation {
                    self.visit_type(annotation);
                }
                if let Some(target) = target {
                    self.visit_param(target);
                }
            }
            Form::Prefixed { prefix: Prefix::Unpack | Prefix::UnpackMapping, inner: Some(inner) } => {
                self.visit_param(inner)
            }
            // [name default]
            Form::Seq { delim: Delim::Bracket, items } => {
                if let Some((first, defaults)) = items.split_first() {
                    self.visit_param(first);
                    self.visit_all(defaults);
                }
            }
            Form::Keyword(span) => self.visit_keyword_literal(*span),
            _ => self.visit_expr(form),
        }
    }

    fn visit_decorator(&mut self, form: &Form) {
        match form {
            Form::Symbol(span) => {
                let segments = self.segments(*span);
                let last = segments.len().saturating_sub(1);
                for (index, (part, start, end)) in segments.into_iter().enumerate() {
                    let kind = if index == last { SymbolKind::Decorator } else { self.scoped_kind(&mangle(part)) };
                    self.record(&mangle(part), kind, start, end);
                }
            }
            Form::Seq { delim: Delim::Paren, items } if !items.is_empty() => {
                self.visit_decorator(&items[0]);
                self.visit_args(&items[1..]);
            }
            _ => self.visit_expr(form),
        }
    }

    fn visit_pattern(&mut self, form: &Form) {
        match form {
            Form::Symbol(span) => {
                let text = self.text(*span);
                if text == "_" || CONSTANTS.contains(&text) || is_operator(text) {
                    return;
                }
                if text.contains('.') {
                    self.visit_symbol(*span, false);
                } else {
                    self.record(&mangle(text), SymbolKind::Variable, span.start, span.end);
                }
            }
            Form::Seq { delim: Delim::Paren, items } => match items.first() {
                Some(Form::Symbol(head)) if is_operator(self.text(*head)) => {
                    for item in &items[1..] {
                        self.visit_pattern(item);
                    }
                }
                Some(Form::Symbol(head)) => {
                    // Class pattern: (Point :x px)
                    self.visit_symbol(*head, false);
                    for item in &items[1..] {
                        self.visit_pattern(item);
                    }
                }
                _ => {
                    for item in items {
                        self.visit_pattern(item);
                    }
                }
            },
            Form::Seq { delim: Delim::Brace, items } => {
                for pair in items.chunks(2) {
                    self.visit_arg(&pair[0]);
                    if let Some(value) = pair.get(1) {
                        self.visit_pattern(value);
                    }
                }
            }
            Form::Seq { items, .. } => {
                for item in items {
                    self.visit_pattern(item);
                }
            }
            Form::Prefixed { prefix: Prefix::Unpack | Prefix::UnpackMapping, inner: Some(inner) } => {
                self.visit_pattern(inner)
            }
            Form::Keyword(span) => self.visit_keyword_literal(*span),
            _ => self.visit_expr(form),
        }
    }

    // --- lists ----------------------------------------------------------------------------

    fn visit_list(&mut self, items: &[Form]) {
        let Some(head) = items.first() else {
            return;
        };
        match head {
            Form::Symbol(span) => {
                let text = self.text(*span);
                if self.is_keyword_head(text) {
                    self.record_keyword(*span);
                    self.visit_special(text, items);
                } else if text == ":" {
                    // doeff contract check: (: value Type)
                    if let Some(value) = items.get(1) {
                        self.visit_expr(value);
                    }
                    for item in items.iter().skip(2) {
                        self.visit_type(item);
                    }
                } else {
                    self.visit_symbol(*span, true);
                    self.visit_args(&items[1..]);
                }
            }
            Form::Keyword(span) if self.text(*span) == ":=" => {
                // Session assignment inside defhandler: (:= name value)
                self.record_keyword(*span);
                self.visit_pairs(&items[1..]);
            }
            _ => {
                self.visit_arg(head);
                self.visit_args(&items[1..]);
            }
        }
    }

    fn visit_special(&mut self, head: &str, items: &[Form]) {
        let rest = &items[1..];
        match head {
            "defn" | "defn/a" | "defmacro" | "defk" | "deff" => self.visit_function_def(rest),
            "fn" | "fn/a" | "fnk" => self.visit_lambda(rest),
            "defclass" => self.visit_class_def(rest),
            "defrecord" => {
                if let Some((name, body)) = rest.split_first() {
                    self.visit_definition_name(name, SymbolKind::Class);
                    self.visit_class_body(body);
                }
            }
            "defenum" => {
                if let Some((name, members)) = rest.split_first() {
                    self.visit_definition_name(name, SymbolKind::Class);
                    for member in members {
                        match member {
                            Form::Symbol(span) => {
                                let name = mangle(self.text(*span));
                                self.record(&name, SymbolKind::Attribute, span.start, span.end);
                            }
                            _ => self.visit_expr(member),
                        }
                    }
                }
            }
            "deftype" | "defadr" => {
                if let Some((name, body)) = rest.split_first() {
                    self.visit_definition_name(name, SymbolKind::Class);
                    self.visit_args(body);
                }
            }
            "deftest" | "defp" | "defpp" | "defpipeline" | "defworkflow" | "defphase" | "defsemgrep"
            | "law" | "defreader" | "defmain" => {
                if let Some((name, body)) = rest.split_first() {
                    self.visit_definition_name(name, SymbolKind::Function);
                    self.visit_body(body);
                }
            }
            "defmcp-tool" => {
                if let Some((name, body)) = rest.split_first() {
                    self.visit_definition_name(name, SymbolKind::Function);
                    self.out.push_param_scope();
                    let mut params_seen = false;
                    for form in body {
                        match form.bracket_items() {
                            Some(params) if !params_seen => {
                                params_seen = true;
                                self.visit_params(params);
                            }
                            _ => self.visit_arg(form),
                        }
                    }
                    self.out.pop_param_scope();
                }
            }
            "defhandler" => self.visit_handler_def(rest),
            "handle" => {
                if let Some((body, clauses)) = rest.split_first() {
                    self.visit_expr(body);
                    self.visit_handler_clauses(clauses);
                }
            }
            "setv" | "setx" | "set!" | "val" | "var" => self.visit_pairs(rest),
            "session" | "lazy" => {
                // (session var name init) / (lazy val name expr)
                let mut forms = rest;
                if let Some(Form::Symbol(span)) = forms.first() {
                    if matches!(self.text(*span), "var" | "val") {
                        self.record_keyword(*span);
                        forms = &forms[1..];
                    }
                }
                self.visit_pairs(forms);
            }
            "<-" => match rest.len() {
                0 => {}
                1 => self.visit_expr(&rest[0]),
                2 => {
                    self.visit_target(&rest[0]);
                    self.visit_expr(&rest[1]);
                }
                _ => {
                    self.visit_target(&rest[0]);
                    self.visit_type(&rest[1]);
                    self.visit_all(&rest[2..]);
                }
            },
            "let" => {
                if let Some((bindings, body)) = rest.split_first() {
                    match bindings.bracket_items() {
                        Some(pairs) => self.visit_pairs(pairs),
                        None => self.visit_expr(bindings),
                    }
                    self.visit_all(body);
                }
            }
            "for" | "for/a" | "for/do" | "parallel-for" => {
                if let Some((clauses, body)) = rest.split_first() {
                    match clauses.bracket_items() {
                        Some(clauses) => self.visit_clauses(clauses, 0),
                        None => self.visit_expr(clauses),
                    }
                    self.visit_all(body);
                }
            }
            "lfor" | "sfor" | "gfor" => self.visit_clauses(rest, 1),
            "dfor" => self.visit_clauses(rest, 2),
            "with" | "with/a" => {
                if let Some((bindings, body)) = rest.split_first() {
                    match bindings.bracket_items() {
                        Some([single]) => self.visit_expr(single),
                        Some(pairs) => self.visit_pairs(pairs),
                        None => self.visit_expr(bindings),
                    }
                    self.visit_all(body);
                }
            }
            "except" | "except*" => {
                if let Some((binding, body)) = rest.split_first() {
                    match binding.bracket_items() {
                        Some([]) => {}
                        Some([types]) => self.visit_expr(types),
                        Some([name, types @ ..]) => {
                            self.visit_target(name);
                            self.visit_all(types);
                        }
                        None => self.visit_expr(binding),
                    }
                    self.visit_all(body);
                }
            }
            "import" | "require" => self.visit_import(rest),
            "match" => {
                if let Some((subject, clauses)) = rest.split_first() {
                    self.visit_expr(subject);
                    self.visit_match_clauses(clauses);
                }
            }
            "." => {
                if let Some((object, accessors)) = rest.split_first() {
                    self.visit_expr(object);
                    for accessor in accessors {
                        match accessor {
                            Form::Symbol(span) => {
                                let name = mangle(self.text(*span));
                                self.record(&name, SymbolKind::Attribute, span.start, span.end);
                            }
                            Form::Seq { delim: Delim::Paren, items } => {
                                if let Some(Form::Symbol(span)) = items.first() {
                                    let name = mangle(self.text(*span));
                                    self.record(&name, SymbolKind::MethodCall, span.start, span.end);
                                    self.visit_args(&items[1..]);
                                } else {
                                    self.visit_expr(accessor);
                                }
                            }
                            _ => self.visit_expr(accessor),
                        }
                    }
                }
            }
            "annotate" => {
                if let Some((value, types)) = rest.split_first() {
                    self.visit_expr(value);
                    for form in types {
                        self.visit_type(form);
                    }
                }
            }
            "quote" => {
                for form in rest {
                    self.visit_quoted(form);
                }
            }
            "quasiquote" => {
                for form in rest {
                    self.visit_quasiquoted(form);
                }
            }
            _ => self.visit_args(rest),
        }
    }

    fn visit_definition_name(&mut self, form: &Form, kind: SymbolKind) {
        match form {
            Form::Symbol(span) => {
                let name = mangle(self.text(*span));
                self.record(&name, kind, span.start, span.end);
            }
            Form::Annotated { annotation, target } => {
                if let Some(annotation) = annotation {
                    self.visit_type(annotation);
                }
                if let Some(target) = target {
                    self.visit_definition_name(target, kind);
                }
            }
            _ => self.visit_arg(form),
        }
    }

    /// Decorator list: `[decorators]` directly before the name (`(defn [deco] name …)`).
    fn split_decorators<'f>(&mut self, forms: &'f [Form]) -> &'f [Form] {
        if let (Some(decorators), Some(Form::Symbol(_) | Form::Annotated { .. })) =
            (forms.first().and_then(Form::bracket_items), forms.get(1))
        {
            for decorator in decorators {
                self.visit_decorator(decorator);
            }
            &forms[1..]
        } else {
            forms
        }
    }

    fn visit_function_def(&mut self, forms: &[Form]) {
        let forms = self.split_decorators(forms);
        let Some((name, rest)) = forms.split_first() else {
            return;
        };
        self.visit_definition_name(name, SymbolKind::Function);
        self.out.push_param_scope();
        let body = match rest.split_first() {
            Some((params, body)) if params.bracket_items().is_some() => {
                self.visit_params(params.bracket_items().unwrap_or_default());
                body
            }
            _ => rest,
        };
        self.visit_body(body);
        self.out.pop_param_scope();
    }

    fn visit_lambda(&mut self, forms: &[Form]) {
        let Some((params, body)) = forms.split_first() else {
            return;
        };
        self.out.push_param_scope();
        match params {
            Form::Seq { delim: Delim::Bracket, items } => self.visit_params(items),
            // (fn #^ ReturnType [params] …)
            Form::Annotated { annotation, target } => {
                if let Some(annotation) = annotation {
                    self.visit_type(annotation);
                }
                if let Some(items) = target.as_deref().and_then(Form::bracket_items) {
                    self.visit_params(items);
                }
            }
            other => self.visit_expr(other),
        }
        self.visit_body(body);
        self.out.pop_param_scope();
    }

    fn visit_class_def(&mut self, forms: &[Form]) {
        let forms = self.split_decorators(forms);
        let Some((name, rest)) = forms.split_first() else {
            return;
        };
        self.visit_definition_name(name, SymbolKind::Class);
        let body = match rest.split_first() {
            Some((bases, body)) if bases.bracket_items().is_some() => {
                for base in bases.bracket_items().unwrap_or_default() {
                    self.visit_type(base);
                }
                body
            }
            _ => rest,
        };
        self.visit_class_body(body);
    }

    /// Class / record body: `(#^ Type field)` declares a field (colored as an attribute).
    fn visit_class_body(&mut self, forms: &[Form]) {
        let mut index = 0;
        if let Some(Form::Str { kind: StrKind::Plain, span, .. }) = forms.first() {
            self.record_lines("__docstring__", SymbolKind::Docstring, span.start, span.end);
            index = 1;
        }
        for form in &forms[index..] {
            match form.paren_items() {
                Some([Form::Annotated { annotation, target }, defaults @ ..]) => {
                    if let Some(annotation) = annotation {
                        self.visit_type(annotation);
                    }
                    if let Some(Form::Symbol(span)) = target.as_deref() {
                        let name = mangle(self.text(*span));
                        self.record(&name, SymbolKind::Attribute, span.start, span.end);
                    } else if let Some(target) = target {
                        self.visit_expr(target);
                    }
                    self.visit_all(defaults);
                }
                _ => self.visit_expr(form),
            }
        }
    }

    fn visit_handler_def(&mut self, forms: &[Form]) {
        let Some((name, rest)) = forms.split_first() else {
            return;
        };
        self.visit_definition_name(name, SymbolKind::Function);
        self.out.push_param_scope();
        let clauses = match rest.split_first() {
            Some((params, clauses)) if params.bracket_items().is_some() => {
                self.visit_params(params.bracket_items().unwrap_or_default());
                clauses
            }
            _ => rest,
        };
        let clauses = match clauses.first() {
            Some(Form::Str { kind: StrKind::Plain, span, .. }) => {
                self.record_lines("__docstring__", SymbolKind::Docstring, span.start, span.end);
                &clauses[1..]
            }
            _ => clauses,
        };
        self.visit_handler_clauses(clauses);
        self.out.pop_param_scope();
    }

    /// Effect clauses: `(EffectName [fields] body…)`, plus `(session var name init)` state declarations.
    fn visit_handler_clauses(&mut self, clauses: &[Form]) {
        for clause in clauses {
            match clause.paren_items() {
                Some(items @ [Form::Symbol(head), ..]) if self.text(*head) == "session" => {
                    self.record_keyword(*head);
                    self.visit_special("session", items);
                }
                Some([Form::Symbol(effect), params, body @ ..])
                    if params.bracket_items().is_some() && !self.is_keyword_head(self.text(*effect)) =>
                {
                    self.visit_symbol(*effect, true);
                    self.out.push_param_scope();
                    self.visit_params(params.bracket_items().unwrap_or_default());
                    self.visit_all(body);
                    self.out.pop_param_scope();
                }
                _ => self.visit_expr(clause),
            }
        }
    }

    /// Comprehension / loop clauses: `target iterable :if cond :setv t v …`, then `tail` result forms.
    fn visit_clauses(&mut self, forms: &[Form], tail: usize) {
        let limit = forms.len().saturating_sub(tail);
        let mut index = 0;
        while index < limit {
            match &forms[index] {
                Form::Keyword(span) => {
                    let text = self.text(*span);
                    self.visit_keyword_literal(*span);
                    match text {
                        ":setv" => {
                            if let Some(target) = forms.get(index + 1) {
                                self.visit_target(target);
                            }
                            if let Some(value) = forms.get(index + 2).filter(|_| index + 2 < limit) {
                                self.visit_expr(value);
                            }
                            index += 3;
                        }
                        ":async" => index += 1,
                        _ => {
                            if let Some(value) = forms.get(index + 1).filter(|_| index + 1 < limit) {
                                self.visit_expr(value);
                            }
                            index += 2;
                        }
                    }
                }
                target => {
                    self.visit_target(target);
                    if let Some(iterable) = forms.get(index + 1).filter(|_| index + 1 < limit) {
                        self.visit_expr(iterable);
                    }
                    index += 2;
                }
            }
        }
        for form in &forms[limit.min(forms.len())..] {
            self.visit_expr(form);
        }
    }

    fn visit_import(&mut self, forms: &[Form]) {
        let mut index = 0;
        while index < forms.len() {
            match &forms[index] {
                Form::Symbol(span) => self.record_import(*span),
                Form::Keyword(span) => {
                    let text = self.text(*span);
                    self.record_keyword(*span);
                    if text == ":as" {
                        if let Some(Form::Symbol(alias)) = forms.get(index + 1) {
                            self.record_import(*alias);
                            index += 1;
                        }
                    }
                }
                Form::Seq { delim: Delim::Bracket, items } => self.visit_import(items),
                other => self.visit_expr(other),
            }
            index += 1;
        }
    }

    fn record_import(&mut self, span: Span) {
        let text = self.text(span);
        if !is_operator(text) {
            self.record(&mangle(text), SymbolKind::Import, span.start, span.end);
        }
    }

    fn visit_match_clauses(&mut self, forms: &[Form]) {
        let mut index = 0;
        while index < forms.len() {
            self.visit_pattern(&forms[index]);
            index += 1;
            loop {
                match forms.get(index) {
                    Some(Form::Keyword(span)) if self.text(*span) == ":as" => {
                        self.record_keyword(*span);
                        if let Some(name) = forms.get(index + 1) {
                            self.visit_pattern(name);
                        }
                        index += 2;
                    }
                    Some(Form::Keyword(span)) if self.text(*span) == ":if" => {
                        self.record_keyword(*span);
                        if let Some(guard) = forms.get(index + 1) {
                            self.visit_expr(guard);
                        }
                        index += 2;
                    }
                    _ => break,
                }
            }
            if let Some(result) = forms.get(index) {
                self.visit_expr(result);
            }
            index += 1;
        }
    }
}

/// Finds the `}` that closes the `{` at `open` inside an f-string, skipping nested brackets and strings.
fn matching_brace(bytes: &[u8], open: usize, end: usize) -> usize {
    let mut depth = 0usize;
    let mut i = open;
    while i < end {
        match bytes[i] {
            b'{' | b'(' | b'[' => depth += 1,
            b'}' | b')' | b']' => {
                depth = depth.saturating_sub(1);
                if depth == 0 {
                    return i;
                }
            }
            b'"' => {
                i += 1;
                while i < end && bytes[i] != b'"' {
                    if bytes[i] == b'\\' {
                        i += 1;
                    }
                    i += 1;
                }
            }
            b'\\' => i += 1,
            _ => {}
        }
        i += 1;
    }
    end
}

pub(crate) fn analyze(source: &str) -> HighlighterOutput {
    let mut reader = Reader::new(source, 0, source.len());
    let forms = reader.read_all();

    let mut keywords: HashSet<String> = HY_KEYWORDS.iter().chain(DOEFF_KEYWORDS).map(|s| s.to_string()).collect();
    let mut required = HashSet::new();
    collect_required(&forms, source, &mut required);
    for name in DOEFF_REQUIRED_KEYWORDS {
        if required.contains(*name) {
            keywords.insert(name.to_string());
        }
    }

    let line_index = LineIndex::new(source);
    let mut analyzer = HyAnalyzer { src: source, out: SymbolCollector::new(source, &line_index), keywords };
    for comment in &reader.comments {
        analyzer.record("__comment__", SymbolKind::Comment, comment.start, comment.end);
    }
    analyzer.visit_all(&forms);
    analyzer.out.into_output()
}

#[cfg(test)]
mod tests {
    use super::*;

    fn kinds_of(output: &HighlighterOutput, name: &str) -> Vec<SymbolKind> {
        output.symbols.iter().filter(|s| s.name == name).map(|s| s.kind).collect()
    }

    fn has(output: &HighlighterOutput, name: &str, kind: SymbolKind) -> bool {
        output.symbols.iter().any(|s| s.name == name && s.kind == kind)
    }

    #[test]
    fn defn_with_params_and_docstring() {
        let out = analyze("(defn greet [name #^ int count]\n  \"Say hi.\"\n  (print name count))\n");
        assert!(has(&out, "defn", SymbolKind::Keyword));
        assert!(has(&out, "greet", SymbolKind::Function));
        assert!(has(&out, "int", SymbolKind::TypeAnnotation));
        assert!(has(&out, "print", SymbolKind::FunctionCall));
        assert!(has(&out, "__docstring__", SymbolKind::Docstring));
        let name = out.symbols.iter().find(|s| s.name == "name" && s.kind == SymbolKind::Parameter).unwrap();
        assert_eq!(name.occurrences.len(), 2, "definition and use share the parameter color");
    }

    #[test]
    fn dashes_are_mangled_like_python() {
        let out = analyze("(setv my-value 1)\n(print my-value)\n");
        let var = out.symbols.iter().find(|s| s.name == "my_value").unwrap();
        assert_eq!(var.kind, SymbolKind::Variable);
        assert_eq!(var.occurrences.len(), 2);
        assert_eq!(var.occurrences[0].length, "my-value".len());
    }

    #[test]
    fn dotted_symbols_and_method_calls() {
        let out = analyze("(defn f [obj] (.strip obj.name) (obj.save :force True))\n");
        assert!(has(&out, "strip", SymbolKind::MethodCall));
        assert!(has(&out, "name", SymbolKind::Attribute));
        assert!(has(&out, "save", SymbolKind::MethodCall));
        assert!(has(&out, "force", SymbolKind::KwargName));
        assert_eq!(kinds_of(&out, "obj"), vec![SymbolKind::Parameter]);
    }

    #[test]
    fn imports_and_aliases() {
        let out = analyze("(import os.path :as p)\n(import doeff [with_handlers EffectBase])\n");
        assert!(has(&out, "os.path", SymbolKind::Import));
        assert!(has(&out, "p", SymbolKind::Import));
        assert!(has(&out, ":as", SymbolKind::Keyword));
        assert!(has(&out, "with_handlers", SymbolKind::Import));
    }

    #[test]
    fn doeff_defk_with_contract_and_binds() {
        let source = "(require doeff-hy.macros [defk <- val var])\n\
                      (defk step [state]\n  {:pre [(: state dict)] :post [(: % int)]}\n  \"One step.\"\n  \
                      (<- now float (GetTime))\n  (val total (+ now 1))\n  total)\n";
        let out = analyze(source);
        assert!(has(&out, "defk", SymbolKind::Keyword));
        assert!(has(&out, "step", SymbolKind::Function));
        assert!(has(&out, "pre", SymbolKind::KwargName));
        assert!(has(&out, "dict", SymbolKind::TypeAnnotation));
        assert!(has(&out, "float", SymbolKind::TypeAnnotation));
        assert!(has(&out, "now", SymbolKind::Variable));
        assert!(has(&out, "GetTime", SymbolKind::FunctionCall));
        assert!(has(&out, "val", SymbolKind::Keyword));
        assert!(has(&out, "__docstring__", SymbolKind::Docstring));
        assert_eq!(kinds_of(&out, "state"), vec![SymbolKind::Parameter]);
    }

    #[test]
    fn lazy_and_session_bindings() {
        let out = analyze("(require doeff-hy.macros [lazy])\n(lazy val table (load))\n(print table)\n");
        assert!(has(&out, "lazy", SymbolKind::Keyword));
        assert!(has(&out, "val", SymbolKind::Keyword));
        let table = out.symbols.iter().find(|s| s.name == "table").unwrap();
        assert_eq!(table.kind, SymbolKind::Variable);
        assert_eq!(table.occurrences.len(), 2);
    }

    #[test]
    fn required_word_macros_only_when_required() {
        let out = analyze("(check x)\n");
        assert!(has(&out, "check", SymbolKind::FunctionCall));
        let out = analyze("(require doeff-hy.macros [check])\n(check x)\n");
        assert!(has(&out, "check", SymbolKind::Keyword));
    }

    #[test]
    fn defhandler_clauses_bind_effect_fields() {
        let source = "(defhandler record-writes\n  (session var writes #())\n  (PutRow [table key]\n    \
                      (:= writes (+ writes #(table)))\n    (resume key)))\n";
        let out = analyze(source);
        assert!(has(&out, "record_writes", SymbolKind::Function));
        assert!(has(&out, "PutRow", SymbolKind::FunctionCall));
        assert!(has(&out, "session", SymbolKind::Keyword) || has(&out, "session", SymbolKind::FunctionCall));
        assert!(has(&out, ":=", SymbolKind::Keyword));
        assert!(has(&out, "resume", SymbolKind::Keyword));
        let table = out.symbols.iter().find(|s| s.name == "table").unwrap();
        assert_eq!(table.kind, SymbolKind::Parameter);
        assert_eq!(table.occurrences.len(), 2);
    }

    #[test]
    fn defclass_fields_and_decorators() {
        let source = "(defclass [(dataclass :frozen True)] Run [Base]\n  \"Doc\"\n  (#^ int cycles)\n  (#^ (| str None) error))\n";
        let out = analyze(source);
        assert!(has(&out, "dataclass", SymbolKind::Decorator));
        assert!(has(&out, "Run", SymbolKind::Class));
        assert!(has(&out, "Base", SymbolKind::TypeAnnotation));
        assert!(has(&out, "cycles", SymbolKind::Attribute));
        assert!(has(&out, "str", SymbolKind::TypeAnnotation));
        assert!(has(&out, "__docstring__", SymbolKind::Docstring));
    }

    #[test]
    fn comprehension_and_for_targets() {
        let out = analyze("(lfor x xs :if (> x 0) (* x 2))\n(for [[k v] (.items d)] (print k v))\n");
        assert!(has(&out, "x", SymbolKind::Variable));
        assert!(has(&out, ":if", SymbolKind::Keyword));
        assert!(has(&out, "k", SymbolKind::Variable));
        assert!(has(&out, "items", SymbolKind::MethodCall));
    }

    #[test]
    fn match_patterns_bind_names() {
        let out = analyze("(match roll.how\n  \"drain\" 0\n  (Finished) outcome.code\n  [a b] (+ a b)\n  _ 1)\n");
        assert!(has(&out, "a", SymbolKind::Variable));
        assert!(has(&out, "Finished", SymbolKind::Variable));
        assert!(has(&out, "how", SymbolKind::Attribute));
        assert!(!out.symbols.iter().any(|s| s.name == "_"));
    }

    #[test]
    fn strings_comments_and_fstrings() {
        let source = ";; top comment\n(setv s f\"x={(+ a 1)} y={b !r}\")\n(setv r #[[raw \"text\"]])\n(setv m \"line1\nline2\")\n#_ (ignored form)\n";
        let out = analyze(source);
        let comment = out.symbols.iter().find(|s| s.kind == SymbolKind::Comment).unwrap();
        assert_eq!(comment.occurrences.len(), 2, "line comment and discarded form");
        assert!(has(&out, "a", SymbolKind::Variable));
        assert!(has(&out, "b", SymbolKind::Variable));
        assert!(has(&out, "__string__", SymbolKind::Fstring));
        assert!(has(&out, "__string__", SymbolKind::RawString));
        let plain = out.symbols.iter().find(|s| s.kind == SymbolKind::String).unwrap();
        assert_eq!(plain.occurrences.len(), 2, "a multi-line string is recorded per line");
    }

    #[test]
    fn unbalanced_source_does_not_panic() {
        for source in ["(defn f [x", "(setv x \"unterminated", "))) (foo", "#[[never closed", "(f #^", "f\"{(g", "#_"] {
            let _ = analyze(source);
        }
    }

    #[test]
    fn positions_count_characters_not_bytes() {
        let out = analyze(";; 日本語\n(setv 名前 1)\n");
        let var = out.symbols.iter().find(|s| s.name == "名前").unwrap();
        assert_eq!(var.occurrences[0].line, 1);
        assert_eq!(var.occurrences[0].column, 6);
        assert_eq!(var.occurrences[0].length, 2);
    }
}
