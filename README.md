# DoubleRange - Vanilla JavaScript Dual-Thumb Range Slider

Accessible, dependency-free vanilla JS dual-thumb range slider with keyboard/touch support, ARIA compliance, customizable styling, and programmatic API (callback, update, before change and more).

## Features

- Lightweight , safe, fast and dependency-free (~12 KB minified)
- Full keyboard, mouse, and touch support
- ARIA accessible (screen reader friendly)
- Auto-cleanup when DOM is removed
- No memory leaks (on-demand event listeners)
- Highly customizable styling via CSS variables
- Programmatic API: `setFrom()`, `setTo()`, `update()`, `destroy()`, etc.
- Configurable formatter and debounced callback
- Prevents invalid states (e.g., from >= to)
- Before-change hooks (`beforeFromChange`, `beforeToChange`)
- Can be initialized from existing HTML structure

## Demo
[https://ej-kon.github.io/DoubleRange/](https://ej-kon.github.io/DoubleRange/)

## License

[MIT License](https://opensource.org/licenses/MIT)

## Installation

### Manual download:
Download the latest release and include the JS and CSS files:
```html
<script src="doublerange.min.js"></script>
<link rel="stylesheet" href="doublerange.min.css">
```

## Usage

### HTML Setup (A unique element that already is on DOM)
```html
<div id="my-slider"></div>
```

### Via JavaScript Initialization (minimal example)
```javascript
const slider = DoubleRange.create({
	  selector: '#my-slider',
	  label: 'Double range example', 
	  formatter: (v)=>{return `$ ${v}`;}
	  min: 0,
	  max: 100,
	  from: 20,
	  to: 80,
	  step: 1,
	  delay: 100,
	  callback: (from, to) => console.log(`Range: ${from} - ${to}`)
	}
});
```

### Via pre existing HTML
```html
<div id="my-slider">
  <div class="double-range">
    <div role="group" aria-label="Double Range">
      <aside class="start point"></aside>
      <aside class="min limit">0</aside>
      <label for="doubleRange1-from" class="from">20</label>
      <div class="track" role="none">
        <div class="thumb from"
          id="doubleRange1-from" role="slider" tabindex="0"
          aria-orientation="horizontal"
          aria-valuemin="0" aria-valuemax="100" aria-valuenow="20" aria-valuetext="$20">
        </div>
        <div class="thumb to"
          id="doubleRange1-to" role="slider" tabindex="0"
          aria-orientation="horizontal"
          aria-valuemin="0" aria-valuemax="100" aria-valuenow="80" aria-valuetext="$80">
        </div>
        <div class="range-bar"></div>
      </div>
      <label for="doubleRange1-to" class="to">80</label>
      <aside class="max limit">100</aside>
      <aside class="end point"></aside>
  	</div>
	</div>
</div>
```

## API

### `Creation`
#### `DoubleRange.create(config)`
Create DOM and Initialize

**Parameters:**
- `config` (Object): Configuration object
  - `selector` (string): CSS selector for container element
  - `min` (number): Minimum value
  - `max` (number): Maximum value
  - `from` (number): Initial lower value
  - `to` (number): Initial upper value
  - `step` (number): Step increment
  - `callback` (function, `optional`): Function called when values change after delay
  - `delay` (number, `optional`): Debounce delay (ms) for callback only. Default: `0`
  - `formatter` (function, `optional`): Format values for display. Default: `(v) => v`
  - `label` (string, `optional`): ARIA label. Default: `"Range selector"`
  - `beforeFromChange` (function, `optional`): Called before from value changes. Must return boolean - if false, change is prevented
  - `beforeToChange` (function, `optional`): Called before to value changes. Must return boolean - if false, change is prevented

**Returns:**
- `DoubleRange`: New instance

**Throws:**
- `TypeError|RangeError`: If config is invalid


#### `new DoubleRange(config)` 
Initialize from Existing DOM

**Parameters:**
- `config` - Configuration object (same as create , no label needed)

**Returns:**
- `DoubleRange`: New instance

**Throws:**
- `TypeError|RangeError`: If config or DOM is invalid

### `Value Methods`

#### `slider.setFrom(value, fireCallback = true)`
Set the lower thumb's selected value

**Parameters:**
- `value` (number): The new lower value
- `fireCallback` (boolean, optional): Whether to trigger the callback after update. Default: `true`

**Returns:**
- `DoubleRange`: Instance for method chaining if successful
- `false`: If constraints are violated

**Throws:**
- `TypeError`: If `value` is not a number

#### `slider.setTo(value, fireCallback = true)`
Set the upper thumb's selected value

**Parameters:**
- `value` (number): The new upper value
- `fireCallback` (boolean, optional): Whether to trigger the callback after update. Default: `true`

**Returns:**
- `DoubleRange`: Instance for method chaining if successful
- `false`: If constraints are violated

**Throws:**
- `TypeError`: If `value` is not a number

#### `slider.getFrom()`
Get the current lower value

**Returns:**
- `number`: Current lower value

#### `slider.getTo()`
Get the current upper value

**Returns:**
- `number`: Current upper value

### `Range Methods`

#### `slider.setMin(min, fireCallback = true)`
Set the minimum value of the range

**Parameters:**
- `min` (number): The new minimum value
- `fireCallback` (boolean, optional): Whether to trigger the callback after update. Default: `true`

**Returns:**
- `DoubleRange`: Instance for method chaining

**Throws:**
- `TypeError`: If `min` is not a number
- `RangeError`: If constraints are violated

#### `slider.setMax(max, fireCallback = true)`
Set the maximum value of the range

**Parameters:**
- `max` (number): The new maximum value
- `fireCallback` (boolean, optional): Whether to trigger the callback after update. Default: `true`

**Returns:**
- `DoubleRange`: Instance for method chaining

**Throws:**
- `TypeError`: If `max` is not a number
- `RangeError`: If constraints are violated

#### `slider.getMin()`
Get the current minimum bound

**Returns:**
- `number`: Current minimum value

#### `slider.getMax()`
Get the current maximum bound

**Returns:**
- `number`: Current maximum value

### `Bulk Operations`

#### `slider.update(config, fireCallback = true)`
Bulk update multiple slider values at once

**Parameters:**
- `config` (Object): Update options (all properties optional)
- `min` (number, optional): New minimum value
- `max` (number, optional): New maximum value
- `from` (number, optional): New lower thumb value
- `to` (number, optional): New upper thumb value
- `fireCallback` (boolean, optional): Whether to trigger the callback after update. Default: `true`

**Returns:**
- `DoubleRange`: Instance for method chaining

**Throws:**
- `TypeError`: If `config` is not a plain object or any value is not a number
- `RangeError`: If values violate constraints

#### `slider.getRange()`
Get current range as object

**Returns:**
- `Object`: `{ from: number, to: number }`

### `Lifecycle`

#### `slider.destroy()`
Clean up all event listeners and observers

**Returns:**
- `undefined`: Safe to call multiple times


## Styling

Customize via CSS variables:e.g. 

```css
.double-range {
--thumb-from-bg: #007cba;
--thumb-to-bg: #007cba;
--range-bar-bg: #007cba;
--thumb-size: 20px;
}
```

Or / and your CSS selectors:e.g.

```css
#my-slider .double-range label
{
	font-size: 13px;
	color:#222222;
	padding: 0px;
}
```

## Events

The slider dispatches a `range-change` event when values change:

```javascript
document.getElementById('my-slider').addEventListener('range-change', (e) => {
console.log('Range changed:', e.detail.from, 'to', e.detail.to);
});
```