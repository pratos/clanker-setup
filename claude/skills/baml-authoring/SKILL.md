---
name: baml-authoring
description: Author and test BAML (Boundary AI Markup Language) files for structured LLM extraction. Covers clients, types, functions, prompts, and tests.
---

# BAML Authoring

## When to Use

This skill activates when:
- "write a BAML function"
- "create a BAML schema"
- "add a BAML test"
- "extract structured data with BAML"
- Working with `.baml` files in `baml_src/`
- Need to define LLM-powered extraction or classification functions

## Rules

**1. All `.baml` files live in `baml_src/`.**

**2. Follow this authoring order: client -> types -> function -> test.**

**3. Always include `{{ ctx.output_format }}` in prompts** so BAML auto-injects the expected schema.

**4. Use `#"..."#` block strings for multi-line prompt content and test inputs.**

## Structure

### Client (LLM provider config)

```baml
client<llm> MyClient {
  provider openrouter        // or openai, anthropic, etc.
  options { model "gpt-4o" }
}
```

Common providers: `openai`, `anthropic`, `openrouter`, `azure-openai`, `ollama`.

### Types (classes and enums)

```baml
class MyClass {
  field1 string
  field2 int
  field3 bool
  field4 float
  optional_field string?           // nullable
  list_field string[]              // array
  nested NestedClass               // nested type
  nested_list NestedClass[]        // array of nested
}

enum MyEnum {
  VALUE_A @description("Explain when to pick this")
  VALUE_B @description("Explain when to pick this")
}
```

**Type reference:**
| BAML type     | Meaning                  |
|---------------|--------------------------|
| `string`      | Text                     |
| `int`         | Integer                  |
| `float`       | Decimal number           |
| `bool`        | True/false               |
| `string?`     | Nullable string          |
| `string[]`    | List of strings          |
| `MyClass`     | Nested object            |
| `MyClass?`    | Nullable nested object   |
| `MyClass[]`   | List of nested objects   |
| `MyEnum`      | Enum value               |

### Function (LLM call definition)

```baml
function FunctionName(param1: string, param2: int) -> ReturnType {
  client MyClient

  prompt #"
    Instruction for the LLM.

    Input:
    ---
    {{ param1 }}
    ---

    {{ ctx.output_format }}
  "#
}
```

- Function names are PascalCase.
- Parameters use `{{ param_name }}` in prompts via Jinja.
- `{{ ctx.output_format }}` is required -- it tells the LLM what schema to return.

### Test

```baml
test TestName {
  functions [FunctionName]
  args {
    param1 #"
      Multi-line test input goes here.
    "#
    param2 42
  }
}
```

- `functions` links the test to the function being tested.
- `args` must match the function's parameter names and types.
- Run with `baml test` or `baml test -f TestName`.

## Patterns

### Single extraction

```baml
class Invoice {
  vendor string
  total float
  line_items LineItem[]
}

class LineItem {
  description string
  amount float
}

function ExtractInvoice(text: string) -> Invoice {
  client MyClient
  prompt #"
    Extract invoice details from the following text.

    {{ text }}

    {{ ctx.output_format }}
  "#
}
```

### Classification

```baml
enum Sentiment {
  POSITIVE @description("Expresses satisfaction or happiness")
  NEGATIVE @description("Expresses dissatisfaction or frustration")
  NEUTRAL  @description("Neither positive nor negative")
}

function ClassifySentiment(text: string) -> Sentiment {
  client MyClient
  prompt #"
    Classify the sentiment of this text.

    {{ text }}

    {{ ctx.output_format }}
  "#
}
```

### Multi-parameter function

```baml
function Summarize(text: string, max_sentences: int) -> string {
  client MyClient
  prompt #"
    Summarize the following text in at most {{ max_sentences }} sentences.

    {{ text }}

    {{ ctx.output_format }}
  "#
}
```

## Common Mistakes

- Missing `{{ ctx.output_format }}` in the prompt -- BAML won't know what to parse.
- Using `input` instead of `args` in tests.
- Forgetting the `functions [...]` field in tests.
- Putting `.baml` files outside `baml_src/`.
- Using camelCase for enum values (use UPPER_SNAKE_CASE).

## Running

```bash
# Run all tests
baml test

# Run a specific test
baml test -f TestName

# Generate client code (TypeScript/Python)
baml-cli generate
```
