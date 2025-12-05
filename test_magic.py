# %%
# Cell 1
import numpy as np

x = 10
print(x)

# %%
# Cell 2
%matplotlib inline
%load_ext autoreload

def hello(name):
    return f"Hello, {name}"

# %%
%%time
result = hello("World")
print(result)

!ls -la

# %%
y = x + 5
np.array?

