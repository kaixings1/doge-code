# Documentation Generation

Guide to generating documentation for C++ projects using Doxygen, Sphinx, and other tools.

## Doxygen

### Basic Setup

```bash
# Install Doxygen
sudo apt install doxygen

# Generate default config
doxygen -g Doxyfile
```

### Doxyfile Configuration

```
PROJECT_NAME = "My Project"
PROJECT_NUMBER = 1.0.0
OUTPUT_DIRECTORY = docs
INPUT = src include
FILE_PATTERNS = *.c *.cpp *.h
RECURSIVE = YES
EXTRACT_ALL = YES
GENERATE_HTML = YES
GENERATE_LATEX = NO
QUIET = YES
```

### Doxygen Comments

```cpp
/// @file widget.h
/// @brief Widget class header

/// @class Widget
/// @brief A graphical widget.
/// @details More detailed description here.

class Widget {
public:
    /// @brief Default constructor.
    Widget();
    
    /// @brief Construct a widget with size.
    /// @param width The width in pixels.
    /// @param height The height in pixels.
    Widget(int width, int height);
    
    /// @brief Destructor.
    virtual ~Widget();
    
    /// @brief Draw the widget.
    /// @param context The drawing context.
    virtual void draw(Context& context) const;
    
    /// @brief Get widget width.
    /// @return Width in pixels.
    /// @pre Widget must be visible.
    int width() const { return width_; }
    
    /// @brief Set widget position.
    /// @param x X coordinate.
    /// @param y Y coordinate.
    /// @note This does not repaint the widget.
    void set_position(int x, int y);
    
    /// @brief Process event.
    /// @param event The event to process.
    /// @return true if event was handled.
    /// @retval true Event was handled.
    /// @retval false Event was not handled.
    virtual bool event(Event& event);
    
    /// @brief Calculate layout.
    /// @exception std::runtime_error If layout fails.
    void layout() noexcept(false);
    
    /// @name Event Handlers
    /// @{
    void on_click(ClickEvent& e);
    void on_key(KeyEvent& e);
    /// @}
    
private:
    int width_ = 0;
    int height_ = 0;
};
```

### Grouping

```cpp
/// @defgroup graphics Graphics
/// @brief Graphics-related classes and functions.
/// @{

class Renderer;
class Texture;
class Shader;

/// @} // end of graphics
```

## Sphinx with Breathe

### Setup

```bash
pip install sphinx sphinx-rtd-theme breathe

# Create project
sphinx-quickstart
```

### Configuration

```python
# conf.py
extensions = [
    'breathe',
    'sphinx.ext.autodoc',
    'sphinx.ext.viewcode',
]

breathe_projects = {
    "myproject": "doxyxml",
}
```

### Usage

```rst
C++ API Documentation
====================

.. doxygenindex:: 

.. doxygenclass:: Widget
   :members:
   :protected-members:
```

## Markdown Documentation

### Doxygen Markdown

```cpp
/// @file markdown.h
/// # Markdown Support
/// 
/// Doxygen supports Markdown formatting.
/// 
/// ## Headers
/// 
/// ### Code
/// 
/// @code{.cpp}
/// void example();
/// @endcode
/// 
/// ## Lists
/// 
/// - Item 1
/// - Item 2
///   - Nested
/// 
/// ## Links
/// 
/// [Link](https://example.com)
```

## API Documentation

### OpenAPI/Swagger

```yaml
openapi: 3.0.0
info:
  title: My API
  version: 1.0.0
paths:
  /users:
    get:
      summary: List users
      responses:
        '200':
          description: Success
```

## Best Practices

1. **Document as you code** - Doc comments in headers
2. **Use consistent style** - Decide on format early
3. **Generate docs in CI** - Automated builds
4. **Version docs** - Match code versions
5. **Host online** - ReadTheDocs, GitHub Pages

## Resources

- [Doxygen Manual](https://www.doxygen.nl/manual/)
- [Sphinx](https://www.sphinx-doc.org/)
- [Breathe](https://breathe.readthedocs.io/)
