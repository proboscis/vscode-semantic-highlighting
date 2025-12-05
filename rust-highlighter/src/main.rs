use std::cmp;
use std::collections::HashMap;
use std::env;
use std::fs;
use std::path::PathBuf;

use anyhow::{bail, Context, Result};
use rustpython_parser::ast::{self, Identifier};
use rustpython_parser::text_size::TextRange;
use rustpython_parser::Parse;
use serde::Serialize;

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq, Hash, PartialOrd, Ord)]
#[serde(rename_all = "snake_case")]
enum SymbolKind {
    Variable,
    Function,
    Class,
    Parameter,
    Attribute,
    Keyword,
    Decorator,
    TypeAnnotation,
}

#[derive(Debug, Serialize, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
struct Occurrence {
    line: usize,
    column: usize,
    length: usize,
}

#[derive(Debug, Serialize)]
struct SymbolEntry {
    name: String,
    kind: SymbolKind,
    occurrences: Vec<Occurrence>,
}

#[derive(Debug, Serialize)]
struct HighlighterOutput {
    symbols: Vec<SymbolEntry>,
}

#[derive(Hash, Eq, PartialEq)]
struct SymbolKey {
    name: String,
    kind: SymbolKind,
}

struct LineIndex {
    line_starts: Vec<usize>,
}

impl LineIndex {
    fn new(source: &str) -> Self {
        let mut line_starts = Vec::with_capacity(source.len() / 24 + 1);
        line_starts.push(0);
        for (idx, ch) in source.char_indices() {
            if ch == '\n' {
                line_starts.push(idx + ch.len_utf8());
            }
        }
        LineIndex { line_starts }
    }

    fn position(&self, offset: usize, source: &str) -> (usize, usize) {
        if self.line_starts.is_empty() {
            return (0, 0);
        }
        let max_index = self.line_starts.len().saturating_sub(1);
        let mut line_idx = match self.line_starts.binary_search(&offset) {
            Ok(idx) => cmp::min(idx, max_index),
            Err(idx) => cmp::min(idx.saturating_sub(1), max_index),
        };
        if line_idx >= self.line_starts.len() {
            line_idx = self.line_starts.len() - 1;
        }
        let line_start = self.line_starts[line_idx];
        let clamped_offset = cmp::min(offset, source.len());
        let column = source[line_start..clamped_offset].chars().count();
        (line_idx, column)
    }
}

struct SymbolCollector<'a> {
    source: &'a str,
    lines: &'a LineIndex,
    symbols: HashMap<SymbolKey, Vec<Occurrence>>,
}

impl<'a> SymbolCollector<'a> {
    fn new(source: &'a str, lines: &'a LineIndex) -> Self {
        Self {
            source,
            lines,
            symbols: HashMap::new(),
        }
    }

    fn visit_suite(&mut self, suite: &[ast::Stmt]) {
        for stmt in suite {
            self.visit_stmt(stmt);
        }
    }

    fn visit_stmt(&mut self, stmt: &ast::Stmt) {
        match stmt {
            ast::Stmt::FunctionDef(func) => {
                for decorator in &func.decorator_list {
                    self.visit_decorator(decorator);
                }
                let mut cursor = self.record_keyword("def", func.range, None);
                cursor = self.record_identifier_search(&func.name, SymbolKind::Function, func.range, cursor);
                self.visit_arguments(&func.args);
                if let Some(returns) = &func.returns {
                    self.visit_type_annotation(returns);
                }
                for type_param in &func.type_params {
                    self.visit_type_param(type_param);
                }
                for inner in &func.body {
                    self.visit_stmt(inner);
                }
            }
            ast::Stmt::AsyncFunctionDef(func) => {
                for decorator in &func.decorator_list {
                    self.visit_decorator(decorator);
                }
                let mut cursor = self.record_keyword("async", func.range, None);
                cursor = self.record_keyword("def", func.range, cursor);
                cursor = self.record_identifier_search(&func.name, SymbolKind::Function, func.range, cursor);
                self.visit_arguments(&func.args);
                if let Some(returns) = &func.returns {
                    self.visit_type_annotation(returns);
                }
                for type_param in &func.type_params {
                    self.visit_type_param(type_param);
                }
                for inner in &func.body {
                    self.visit_stmt(inner);
                }
            }
            ast::Stmt::ClassDef(class_def) => {
                for decorator in &class_def.decorator_list {
                    self.visit_decorator(decorator);
                }
                let mut cursor = self.record_keyword("class", class_def.range, None);
                cursor = self.record_identifier_search(&class_def.name, SymbolKind::Class, class_def.range, cursor);
                for base in &class_def.bases {
                    self.visit_type_annotation(base);
                }
                for keyword in &class_def.keywords {
                    self.visit_keyword(keyword);
                }
                for inner in &class_def.body {
                    self.visit_stmt(inner);
                }
            }
            ast::Stmt::Return(ret) => {
                self.record_keyword("return", ret.range, None);
                if let Some(value) = &ret.value {
                    self.visit_expr(value);
                }
            }
            ast::Stmt::Delete(del) => {
                self.record_keyword("del", del.range, None);
                for target in &del.targets {
                    self.visit_expr(target);
                }
            }
            ast::Stmt::Assign(assign) => {
                for target in &assign.targets {
                    self.visit_expr(target);
                }
                self.visit_expr(&assign.value);
            }
            ast::Stmt::TypeAlias(alias) => {
                self.record_keyword("type", alias.range, None);
                self.visit_expr(&alias.name);
                for param in &alias.type_params {
                    self.visit_type_param(param);
                }
                self.visit_expr(&alias.value);
            }
            ast::Stmt::AugAssign(aug) => {
                self.visit_expr(&aug.target);
                self.visit_expr(&aug.value);
            }
            ast::Stmt::AnnAssign(ann) => {
                self.visit_expr(&ann.target);
                self.visit_type_annotation(&ann.annotation);
                if let Some(value) = &ann.value {
                    self.visit_expr(value);
                }
            }
            ast::Stmt::For(for_stmt) => {
                let mut cursor = self.record_keyword("for", for_stmt.range, None);
                self.visit_expr(&for_stmt.target);
                cursor = self.record_keyword("in", for_stmt.range, cursor);
                self.visit_expr(&for_stmt.iter);
                for stmt in &for_stmt.body {
                    self.visit_stmt(stmt);
                }
                for stmt in &for_stmt.orelse {
                    self.visit_stmt(stmt);
                }
            }
            ast::Stmt::AsyncFor(for_stmt) => {
                let mut cursor = self.record_keyword("async", for_stmt.range, None);
                cursor = self.record_keyword("for", for_stmt.range, cursor);
                self.visit_expr(&for_stmt.target);
                cursor = self.record_keyword("in", for_stmt.range, cursor);
                self.visit_expr(&for_stmt.iter);
                for stmt in &for_stmt.body {
                    self.visit_stmt(stmt);
                }
                for stmt in &for_stmt.orelse {
                    self.visit_stmt(stmt);
                }
            }
            ast::Stmt::While(while_stmt) => {
                self.record_keyword("while", while_stmt.range, None);
                self.visit_expr(&while_stmt.test);
                for stmt in &while_stmt.body {
                    self.visit_stmt(stmt);
                }
                for stmt in &while_stmt.orelse {
                    self.visit_stmt(stmt);
                }
            }
            ast::Stmt::If(if_stmt) => {
                self.record_keyword("if", if_stmt.range, None);
                self.visit_expr(&if_stmt.test);
                for stmt in &if_stmt.body {
                    self.visit_stmt(stmt);
                }
                for stmt in &if_stmt.orelse {
                    self.visit_stmt(stmt);
                }
            }
            ast::Stmt::With(with_stmt) => {
                self.record_keyword("with", with_stmt.range, None);
                for item in &with_stmt.items {
                    self.visit_expr(&item.context_expr);
                    if let Some(vars) = &item.optional_vars {
                        self.visit_expr(vars);
                    }
                }
                for stmt in &with_stmt.body {
                    self.visit_stmt(stmt);
                }
            }
            ast::Stmt::AsyncWith(with_stmt) => {
                let mut cursor = self.record_keyword("async", with_stmt.range, None);
                cursor = self.record_keyword("with", with_stmt.range, cursor);
                for item in &with_stmt.items {
                    self.visit_expr(&item.context_expr);
                    if let Some(vars) = &item.optional_vars {
                        self.visit_expr(vars);
                    }
                }
                for stmt in &with_stmt.body {
                    self.visit_stmt(stmt);
                }
            }
            ast::Stmt::Match(match_stmt) => {
                self.record_keyword("match", match_stmt.range, None);
                self.visit_expr(&match_stmt.subject);
                for case in &match_stmt.cases {
                    self.visit_match_case(case);
                }
            }
            ast::Stmt::Raise(raise_stmt) => {
                self.record_keyword("raise", raise_stmt.range, None);
                if let Some(exc) = &raise_stmt.exc {
                    self.visit_expr(exc);
                }
                if let Some(cause) = &raise_stmt.cause {
                    self.visit_expr(cause);
                }
            }
            ast::Stmt::Try(try_stmt) => {
                self.record_keyword("try", try_stmt.range, None);
                for stmt in &try_stmt.body {
                    self.visit_stmt(stmt);
                }
                for handler in &try_stmt.handlers {
                    self.visit_except_handler(handler);
                }
                if !try_stmt.orelse.is_empty() {
                    self.record_keyword("else", try_stmt.range, None);
                }
                for stmt in &try_stmt.orelse {
                    self.visit_stmt(stmt);
                }
                if !try_stmt.finalbody.is_empty() {
                    self.record_keyword("finally", try_stmt.range, None);
                }
                for stmt in &try_stmt.finalbody {
                    self.visit_stmt(stmt);
                }
            }
            ast::Stmt::TryStar(try_stmt) => {
                self.record_keyword("try", try_stmt.range, None);
                for stmt in &try_stmt.body {
                    self.visit_stmt(stmt);
                }
                for handler in &try_stmt.handlers {
                    self.visit_except_handler(handler);
                }
                if !try_stmt.orelse.is_empty() {
                    self.record_keyword("else", try_stmt.range, None);
                }
                for stmt in &try_stmt.orelse {
                    self.visit_stmt(stmt);
                }
                if !try_stmt.finalbody.is_empty() {
                    self.record_keyword("finally", try_stmt.range, None);
                }
                for stmt in &try_stmt.finalbody {
                    self.visit_stmt(stmt);
                }
            }
            ast::Stmt::Assert(assert_stmt) => {
                self.record_keyword("assert", assert_stmt.range, None);
                self.visit_expr(&assert_stmt.test);
                if let Some(msg) = &assert_stmt.msg {
                    self.visit_expr(msg);
                }
            }
            ast::Stmt::Import(import_stmt) => {
                self.record_keyword("import", import_stmt.range, None);
                for alias in &import_stmt.names {
                    self.visit_alias(alias);
                }
            }
            ast::Stmt::ImportFrom(import_from) => {
                let mut cursor = self.record_keyword("from", import_from.range, None);
                if let Some(module) = &import_from.module {
                    cursor = self.record_identifier_search(module, SymbolKind::Attribute, import_from.range, cursor);
                }
                cursor = self.record_keyword("import", import_from.range, cursor);
                for alias in &import_from.names {
                    self.visit_alias(alias);
                }
            }
            ast::Stmt::Global(global_stmt) => {
                let mut cursor = self.record_keyword("global", global_stmt.range, None);
                for name in &global_stmt.names {
                    cursor = self.record_identifier_search(name, SymbolKind::Variable, global_stmt.range, cursor);
                }
            }
            ast::Stmt::Nonlocal(nonlocal_stmt) => {
                let mut cursor = self.record_keyword("nonlocal", nonlocal_stmt.range, None);
                for name in &nonlocal_stmt.names {
                    cursor = self.record_identifier_search(name, SymbolKind::Variable, nonlocal_stmt.range, cursor);
                }
            }
            ast::Stmt::Expr(expr_stmt) => {
                self.visit_expr(&expr_stmt.value);
            }
            ast::Stmt::Pass(pass_stmt) => {
                self.record_keyword("pass", pass_stmt.range, None);
            }
            ast::Stmt::Break(break_stmt) => {
                self.record_keyword("break", break_stmt.range, None);
            }
            ast::Stmt::Continue(continue_stmt) => {
                self.record_keyword("continue", continue_stmt.range, None);
            }
        }
    }

    fn visit_decorator(&mut self, expr: &ast::Expr) {
        // Decorators are special - we want to mark the whole decorator expression
        match expr {
            ast::Expr::Name(name) => {
                self.record_identifier_at_range(&name.id, SymbolKind::Decorator, name.range);
            }
            ast::Expr::Attribute(attr) => {
                self.visit_expr(&attr.value);
                self.record_identifier_search(&attr.attr, SymbolKind::Decorator, attr.range, None);
            }
            ast::Expr::Call(call) => {
                // For decorator calls like @decorator(args), mark the function as decorator
                match call.func.as_ref() {
                    ast::Expr::Name(name) => {
                        self.record_identifier_at_range(&name.id, SymbolKind::Decorator, name.range);
                    }
                    ast::Expr::Attribute(attr) => {
                        self.visit_expr(&attr.value);
                        self.record_identifier_search(&attr.attr, SymbolKind::Decorator, attr.range, None);
                    }
                    _ => self.visit_expr(&call.func),
                }
                // Visit arguments normally
                for arg in &call.args {
                    self.visit_expr(arg);
                }
                for keyword in &call.keywords {
                    self.visit_keyword(keyword);
                }
            }
            _ => self.visit_expr(expr),
        }
    }

    fn visit_type_annotation(&mut self, expr: &ast::Expr) {
        // Type annotations get special handling
        match expr {
            ast::Expr::Name(name) => {
                self.record_identifier_at_range(&name.id, SymbolKind::TypeAnnotation, name.range);
            }
            ast::Expr::Attribute(attr) => {
                self.visit_type_annotation(&attr.value);
                self.record_identifier_search(&attr.attr, SymbolKind::TypeAnnotation, attr.range, None);
            }
            ast::Expr::Subscript(sub) => {
                // For Generic types like List[int], Optional[str]
                self.visit_type_annotation(&sub.value);
                self.visit_type_annotation(&sub.slice);
            }
            ast::Expr::Tuple(tuple) => {
                for elt in &tuple.elts {
                    self.visit_type_annotation(elt);
                }
            }
            ast::Expr::BinOp(bin_op) => {
                // For union types like int | str
                self.visit_type_annotation(&bin_op.left);
                self.visit_type_annotation(&bin_op.right);
            }
            ast::Expr::Constant(_) => {
                // String annotations, None, etc - skip
            }
            _ => self.visit_expr(expr),
        }
    }

    fn visit_expr(&mut self, expr: &ast::Expr) {
        match expr {
            ast::Expr::Name(name) => {
                self.record_identifier_at_range(&name.id, SymbolKind::Variable, name.range);
            }
            ast::Expr::Attribute(attr) => {
                self.visit_expr(&attr.value);
                self.record_identifier_search(&attr.attr, SymbolKind::Attribute, attr.range, None);
            }
            ast::Expr::Call(call) => {
                self.visit_expr(&call.func);
                for arg in &call.args {
                    self.visit_expr(arg);
                }
                for keyword in &call.keywords {
                    self.visit_keyword(keyword);
                }
            }
            ast::Expr::BoolOp(bool_op) => {
                for value in &bool_op.values {
                    self.visit_expr(value);
                }
            }
            ast::Expr::BinOp(bin_op) => {
                self.visit_expr(&bin_op.left);
                self.visit_expr(&bin_op.right);
            }
            ast::Expr::UnaryOp(unary_op) => {
                self.visit_expr(&unary_op.operand);
            }
            ast::Expr::Lambda(lambda) => {
                self.record_keyword("lambda", lambda.range, None);
                self.visit_arguments(&lambda.args);
                self.visit_expr(&lambda.body);
            }
            ast::Expr::IfExp(if_exp) => {
                self.visit_expr(&if_exp.test);
                self.visit_expr(&if_exp.body);
                self.visit_expr(&if_exp.orelse);
            }
            ast::Expr::Dict(dict_expr) => {
                for key in &dict_expr.keys {
                    if let Some(key_expr) = key {
                        self.visit_expr(key_expr);
                    }
                }
                for value in &dict_expr.values {
                    self.visit_expr(value);
                }
            }
            ast::Expr::Set(set_expr) => {
                for elt in &set_expr.elts {
                    self.visit_expr(elt);
                }
            }
            ast::Expr::List(list_expr) => {
                for elt in &list_expr.elts {
                    self.visit_expr(elt);
                }
            }
            ast::Expr::Tuple(tuple_expr) => {
                for elt in &tuple_expr.elts {
                    self.visit_expr(elt);
                }
            }
            ast::Expr::Slice(slice) => {
                if let Some(lower) = &slice.lower {
                    self.visit_expr(lower);
                }
                if let Some(upper) = &slice.upper {
                    self.visit_expr(upper);
                }
                if let Some(step) = &slice.step {
                    self.visit_expr(step);
                }
            }
            ast::Expr::Compare(compare) => {
                self.visit_expr(&compare.left);
                for comparator in &compare.comparators {
                    self.visit_expr(comparator);
                }
            }
            ast::Expr::Subscript(sub) => {
                self.visit_expr(&sub.value);
                self.visit_expr(&sub.slice);
            }
            ast::Expr::Starred(starred) => {
                self.visit_expr(&starred.value);
            }
            ast::Expr::NamedExpr(named) => {
                self.visit_expr(&named.target);
                self.visit_expr(&named.value);
            }
            ast::Expr::ListComp(comp) => {
                self.visit_expr(&comp.elt);
                for generator in &comp.generators {
                    self.visit_comprehension(generator);
                }
            }
            ast::Expr::SetComp(comp) => {
                self.visit_expr(&comp.elt);
                for generator in &comp.generators {
                    self.visit_comprehension(generator);
                }
            }
            ast::Expr::DictComp(comp) => {
                self.visit_expr(&comp.key);
                self.visit_expr(&comp.value);
                for generator in &comp.generators {
                    self.visit_comprehension(generator);
                }
            }
            ast::Expr::GeneratorExp(gen) => {
                self.visit_expr(&gen.elt);
                for generator in &gen.generators {
                    self.visit_comprehension(generator);
                }
            }
            ast::Expr::Await(await_expr) => {
                self.record_keyword("await", await_expr.range, None);
                self.visit_expr(&await_expr.value);
            }
            ast::Expr::Yield(yield_expr) => {
                self.record_keyword("yield", yield_expr.range, None);
                if let Some(value) = &yield_expr.value {
                    self.visit_expr(value);
                }
            }
            ast::Expr::YieldFrom(yield_from) => {
                let cursor = self.record_keyword("yield", yield_from.range, None);
                self.record_keyword("from", yield_from.range, cursor);
                self.visit_expr(&yield_from.value);
            }
            ast::Expr::JoinedStr(joined) => {
                for value in &joined.values {
                    self.visit_expr(value);
                }
            }
            ast::Expr::FormattedValue(formatted) => {
                self.visit_expr(&formatted.value);
                if let Some(spec) = &formatted.format_spec {
                    self.visit_expr(spec);
                }
            }
            ast::Expr::Constant(_) => {}
        }
    }

    fn visit_keyword(&mut self, keyword: &ast::Keyword) {
        if let Some(arg) = &keyword.arg {
            self.record_identifier_search(arg, SymbolKind::Attribute, keyword.range, None);
        }
        self.visit_expr(&keyword.value);
    }

    fn visit_comprehension(&mut self, comp: &ast::Comprehension) {
        self.visit_expr(&comp.target);
        self.visit_expr(&comp.iter);
        for if_expr in &comp.ifs {
            self.visit_expr(if_expr);
        }
    }

    fn visit_arguments(&mut self, args: &ast::Arguments) {
        for arg in &args.posonlyargs {
            self.record_arg(&arg.def);
            if let Some(default) = &arg.default {
                self.visit_expr(default);
            }
        }
        for arg in &args.args {
            self.record_arg(&arg.def);
            if let Some(default) = &arg.default {
                self.visit_expr(default);
            }
        }
        if let Some(vararg) = &args.vararg {
            self.record_arg(vararg);
        }
        for arg in &args.kwonlyargs {
            self.record_arg(&arg.def);
            if let Some(default) = &arg.default {
                self.visit_expr(default);
            }
        }
        if let Some(kwarg) = &args.kwarg {
            self.record_arg(kwarg);
        }
    }

    fn visit_match_case(&mut self, case: &ast::MatchCase) {
        self.visit_pattern(&case.pattern);
        if let Some(guard) = &case.guard {
            self.visit_expr(guard);
        }
        for stmt in &case.body {
            self.visit_stmt(stmt);
        }
    }

    fn visit_pattern(&mut self, pattern: &ast::Pattern) {
        match pattern {
            ast::Pattern::MatchValue(value) => {
                self.visit_expr(&value.value);
            }
            ast::Pattern::MatchSingleton(_) => {}
            ast::Pattern::MatchSequence(sequence) => {
                for pat in &sequence.patterns {
                    self.visit_pattern(pat);
                }
            }
            ast::Pattern::MatchMapping(mapping) => {
                for key in &mapping.keys {
                    self.visit_expr(key);
                }
                for pat in &mapping.patterns {
                    self.visit_pattern(pat);
                }
                if let Some(rest) = &mapping.rest {
                    self.record_identifier_search(rest, SymbolKind::Variable, mapping.range, None);
                }
            }
            ast::Pattern::MatchClass(class_pattern) => {
                self.visit_expr(&class_pattern.cls);
                for pat in &class_pattern.patterns {
                    self.visit_pattern(pat);
                }
                let mut cursor: Option<usize> = None;
                for attr in &class_pattern.kwd_attrs {
                    cursor = self.record_identifier_search(attr, SymbolKind::Attribute, class_pattern.range, cursor);
                }
                for pat in &class_pattern.kwd_patterns {
                    self.visit_pattern(pat);
                }
            }
            ast::Pattern::MatchStar(star) => {
                if let Some(name) = &star.name {
                    self.record_identifier_search(name, SymbolKind::Variable, star.range, None);
                }
            }
            ast::Pattern::MatchAs(match_as) => {
                if let Some(pat) = &match_as.pattern {
                    self.visit_pattern(pat);
                }
                if let Some(name) = &match_as.name {
                    self.record_identifier_search(name, SymbolKind::Variable, match_as.range, None);
                }
            }
            ast::Pattern::MatchOr(match_or) => {
                for pat in &match_or.patterns {
                    self.visit_pattern(pat);
                }
            }
        }
    }

    fn visit_type_param(&mut self, param: &ast::TypeParam) {
        match param {
            ast::TypeParam::TypeVar(ty) => {
                self.record_identifier_search(&ty.name, SymbolKind::Parameter, ty.range, None);
                if let Some(bound) = &ty.bound {
                    self.visit_expr(bound);
                }
            }
            ast::TypeParam::ParamSpec(spec) => {
                self.record_identifier_search(&spec.name, SymbolKind::Parameter, spec.range, None);
            }
            ast::TypeParam::TypeVarTuple(tuple) => {
                self.record_identifier_search(&tuple.name, SymbolKind::Parameter, tuple.range, None);
            }
        }
    }

    fn visit_except_handler(&mut self, handler: &ast::ExceptHandler) {
        match handler {
            ast::ExceptHandler::ExceptHandler(ex) => {
                self.record_keyword("except", ex.range, None);
                if let Some(typ) = &ex.type_ {
                    self.visit_expr(typ);
                }
                if let Some(name) = &ex.name {
                    self.record_identifier_search(name, SymbolKind::Variable, ex.range, None);
                }
                for stmt in &ex.body {
                    self.visit_stmt(stmt);
                }
            }
        }
    }

    fn visit_alias(&mut self, alias: &ast::Alias) {
        let mut cursor = self.record_identifier_search(&alias.name, SymbolKind::Variable, alias.range, None);
        if let Some(asname) = &alias.asname {
            cursor = self.record_keyword("as", alias.range, cursor);
            self.record_identifier_search(asname, SymbolKind::Variable, alias.range, cursor);
        }
    }

    fn record_arg(&mut self, arg: &ast::Arg) {
        self.record_identifier_search(&arg.arg, SymbolKind::Parameter, arg.range, None);
        if let Some(annotation) = &arg.annotation {
            self.visit_type_annotation(annotation);
        }
    }

    fn record_identifier_at_range(&mut self, ident: &Identifier, kind: SymbolKind, range: TextRange) {
        let start: usize = range.start().into();
        let end: usize = range.end().into();
        if start >= end || start >= self.source.len() {
            return;
        }
        let end = cmp::min(end, self.source.len());
        let occurrence = self.occurrence_from_span(start, end);
        self.insert_occurrence(ident.as_ref(), kind, occurrence);
    }

    fn record_identifier_search(
        &mut self,
        ident: &Identifier,
        kind: SymbolKind,
        range: TextRange,
        after: Option<usize>,
    ) -> Option<usize> {
        let name = ident.as_ref();
        if let Some((start, end)) = self.find_token_in_range(name, range, after) {
            let occurrence = self.occurrence_from_span(start, end);
            self.insert_occurrence(name, kind, occurrence);
            Some(end)
        } else {
            after
        }
    }

    fn record_keyword(&mut self, keyword: &str, range: TextRange, after: Option<usize>) -> Option<usize> {
        if let Some((start, end)) = self.find_token_in_range(keyword, range, after) {
            let occurrence = self.occurrence_from_span(start, end);
            self.insert_occurrence(keyword, SymbolKind::Keyword, occurrence);
            Some(end)
        } else {
            after
        }
    }

    fn find_token_in_range(
        &self,
        token: &str,
        range: TextRange,
        after: Option<usize>,
    ) -> Option<(usize, usize)> {
        if token.is_empty() {
            return None;
        }
        let mut start: usize = range.start().into();
        let mut end: usize = range.end().into();
        let source_len = self.source.len();
        if start >= source_len {
            return None;
        }
        end = cmp::min(end, source_len);
        if start >= end {
            return None;
        }
        if let Some(after) = after {
            if after >= end {
                return None;
            }
            if after > start {
                start = after;
            }
        }
        let mut cursor = start;
        while cursor < end {
            let haystack = &self.source[cursor..end];
            if let Some(pos) = haystack.find(token) {
                let match_start = cursor + pos;
                let match_end = match_start + token.len();
                if match_end > end {
                    return None;
                }
                if self.is_identifier_boundary(match_start, match_end) {
                    return Some((match_start, match_end));
                }
                cursor = match_start + 1;
            } else {
                break;
            }
        }
        None
    }

    fn is_identifier_boundary(&self, start: usize, end: usize) -> bool {
        fn is_ident(ch: char) -> bool {
            ch == '_' || ch.is_alphanumeric()
        }
        let before = if start == 0 {
            None
        } else {
            self.source[..start].chars().rev().next()
        };
        let after = if end >= self.source.len() {
            None
        } else {
            self.source[end..].chars().next()
        };
        before.map_or(true, |ch| !is_ident(ch)) && after.map_or(true, |ch| !is_ident(ch))
    }

    fn occurrence_from_span(&self, start: usize, end: usize) -> Occurrence {
        let (line, column) = self.lines.position(start, self.source);
        let length = self.source[start..end].chars().count();
        Occurrence {
            line,
            column,
            length,
        }
    }

    fn insert_occurrence(&mut self, name: &str, kind: SymbolKind, occurrence: Occurrence) {
        let key = SymbolKey {
            name: name.to_string(),
            kind,
        };
        self.symbols.entry(key).or_default().push(occurrence);
    }

    fn into_output(self) -> HighlighterOutput {
        let mut symbols: Vec<SymbolEntry> = self
            .symbols
            .into_iter()
            .map(|(key, mut occurrences)| {
                occurrences.sort();
                occurrences.dedup();
                SymbolEntry {
                    name: key.name,
                    kind: key.kind,
                    occurrences,
                }
            })
            .collect();
        symbols.sort_by(|a, b| a.name.cmp(&b.name).then(a.kind.cmp(&b.kind)));
        HighlighterOutput { symbols }
    }
}

fn main() -> Result<()> {
    let mut args = env::args().skip(1);
    let path = match args.next() {
        Some(p) => PathBuf::from(p),
        None => bail!("expected python file path"),
    };

    let source = fs::read_to_string(&path)
        .with_context(|| format!("failed to read {}", path.display()))?;

    let suite = ast::Suite::parse(&source, path.to_string_lossy().as_ref())
        .context("failed to parse python source")?;

    let line_index = LineIndex::new(&source);
    let mut collector = SymbolCollector::new(&source, &line_index);
    collector.visit_suite(&suite);
    let output = collector.into_output();
    serde_json::to_writer(std::io::stdout(), &output)?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use rustpython_parser::ast::Suite;
    use rustpython_parser::Parse;

    fn analyze(source: &str) -> HighlighterOutput {
        let suite = Suite::parse(source, "<test>").expect("failed to parse");
        let line_index = LineIndex::new(source);
        let mut collector = SymbolCollector::new(source, &line_index);
        collector.visit_suite(&suite);
        collector.into_output()
    }

    #[test]
    fn test_function_def() {
        let source = "def hello(name):\n    return name\n";
        let output = analyze(source);
        
        // Should find: def (keyword), hello (function), name (parameter), name (variable), return (keyword)
        assert!(output.symbols.iter().any(|s| s.name == "def" && s.kind == SymbolKind::Keyword));
        assert!(output.symbols.iter().any(|s| s.name == "hello" && s.kind == SymbolKind::Function));
        assert!(output.symbols.iter().any(|s| s.name == "name" && s.kind == SymbolKind::Parameter));
        assert!(output.symbols.iter().any(|s| s.name == "return" && s.kind == SymbolKind::Keyword));
    }

    #[test]
    fn test_class_def() {
        let source = "class MyClass:\n    def __init__(self):\n        pass\n";
        let output = analyze(source);
        
        assert!(output.symbols.iter().any(|s| s.name == "class" && s.kind == SymbolKind::Keyword));
        assert!(output.symbols.iter().any(|s| s.name == "MyClass" && s.kind == SymbolKind::Class));
        assert!(output.symbols.iter().any(|s| s.name == "__init__" && s.kind == SymbolKind::Function));
        assert!(output.symbols.iter().any(|s| s.name == "self" && s.kind == SymbolKind::Parameter));
    }

    #[test]
    fn test_variable_occurrences() {
        let source = "x = 1\ny = x + 2\nprint(x)\n";
        let output = analyze(source);
        
        let x_var = output.symbols.iter()
            .find(|s| s.name == "x" && s.kind == SymbolKind::Variable)
            .expect("x variable not found");
        
        // x should appear 3 times: assignment, usage in y, usage in print
        assert_eq!(x_var.occurrences.len(), 3);
    }

    #[test]
    fn test_attribute_access() {
        let source = "obj.attr = 1\nprint(obj.attr)\n";
        let output = analyze(source);
        
        assert!(output.symbols.iter().any(|s| s.name == "obj" && s.kind == SymbolKind::Variable));
        assert!(output.symbols.iter().any(|s| s.name == "attr" && s.kind == SymbolKind::Attribute));
    }

    #[test]
    fn test_for_loop() {
        let source = "for i in range(10):\n    print(i)\n";
        let output = analyze(source);
        
        assert!(output.symbols.iter().any(|s| s.name == "for" && s.kind == SymbolKind::Keyword));
        assert!(output.symbols.iter().any(|s| s.name == "in" && s.kind == SymbolKind::Keyword));
        assert!(output.symbols.iter().any(|s| s.name == "i" && s.kind == SymbolKind::Variable));
        assert!(output.symbols.iter().any(|s| s.name == "range" && s.kind == SymbolKind::Variable));
    }

    #[test]
    fn test_line_column_positions() {
        let source = "x = 1\n";
        let output = analyze(source);
        
        let x_var = output.symbols.iter()
            .find(|s| s.name == "x" && s.kind == SymbolKind::Variable)
            .expect("x variable not found");
        
        assert_eq!(x_var.occurrences.len(), 1);
        assert_eq!(x_var.occurrences[0].line, 0);
        assert_eq!(x_var.occurrences[0].column, 0);
        assert_eq!(x_var.occurrences[0].length, 1);
    }

    #[test]
    fn test_multiline() {
        let source = "def foo():\n    x = 1\n    return x\n";
        let output = analyze(source);
        
        let x_var = output.symbols.iter()
            .find(|s| s.name == "x" && s.kind == SymbolKind::Variable)
            .expect("x variable not found");
        
        assert_eq!(x_var.occurrences.len(), 2);
        // First occurrence on line 1 (0-indexed)
        assert_eq!(x_var.occurrences[0].line, 1);
        // Second occurrence on line 2
        assert_eq!(x_var.occurrences[1].line, 2);
    }
}

