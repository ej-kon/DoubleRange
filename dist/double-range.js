/**
 * DoubleRange - Vanilla JavaScript Dual-Thumb Range Slider
 * (c) 2025 – MIT licence
 * https://github.com/ej-kon/DoubleRange
 *
 * A fully accessible, self-cleaning, programmatic range slider with two draggable thumbs.
 * Uses custom `div[role="slider"]` for full control over visuals and behavior.
 * 
 * Features:
 * - Keyboard, mouse, and touch support
 * - ARIA accessibility (screen reader friendly)
 * - On-demand global event listeners (no memory leaks)
 * - Auto-cleanup when DOM is removed
 * - Configurable formatter and debounced callback
 * - Public API: setFrom, setTo, getFrom, getTo, update, destroy, etc.
 * - Prevents invalid states (e.g., from >= to)
 * 
 * @example
 * const slider = DoubleRange.create({
 *   selector: '#price-slider',
 *   min: 0,
 *   max: 100,
 *   from: 20,
 *   to: 80,
 *   step: 5,
 *   label: 'Price range',
 *   formatter: v => `${v}`,
 *   delay: 100,
 *   callback: (from, to) => console.log(`Range: ${from} - ${to}`)
 * });
 * 
 * slider.setFrom(30);
 * console.log(slider.getTo()); // 80
 */
class DoubleRange {
	// Static state
	static #counter = 0; // Unique ID counter for generated elements
	static #map = new WeakMap(); // Map DOM container → instance (for lookup & cleanup)

	// Instance state flags
	#destroyed = false; // Prevents double-destroy
	#div = null; // double-range container element
	#hasLabelsCollision = false; // if the from / to labels would be in collision

	// DOM references
	#track = null; // Track background
	#fromThumb = null; // Lower thumb
	#toThumb = null; // Upper thumb
	#fromLabel = null; // Label for lower thumb
	#toLabel = null; // Label for upper thumb
	#minLabel = null; // Static min value display
	#maxLabel = null; // Static max value display

	// Configuration
	#formatter = null; // User function to format values for display
	#callback = null; // User callback (from, to)
	#delay = 0; // Debounce delay for callback
	#callbackTimer = null; // Timeout ID for debounced callback
	#beforeFromChange = null; // User function before from value changes
	#beforeToChange = null; // User function before from value changes

	// Internal state
	#min = 0; // Minimum allowed value
	#max = 100; // Maximum allowed value
	#step = 1; // Step increment
	#fromValue = 0; // Current lower selected value
	#toValue = 100; // Current upper selected value
	#isDragging = null; // Currently dragging: 'from', 'to', or null
	#duringDrag = false; // Flag to prevent callback scheduling during drag
	#trackRect = null; // Cached bounding rect during drag (for performance)
	#divRect = null; // Cached bounding rect of the double-range div for labels positioning

	// ResizeObserver for auto-cleanup when DOM is removed
	#modifyObserver = null;

	// Bound event handlers (retain `this` context and allow removal)
	#onFromMouseDown = (e) => this.#onDragStart(e, 'from');
	#onToMouseDown = (e) => this.#onDragStart(e, 'to');
	#onFromTouchStart = (e) => this.#onDragStart(e, 'from', true);
	#onToTouchStart = (e) => this.#onDragStart(e, 'to', true);
	#onFromKeyDown = (e) => this.#onKey(e, 'from');
	#onToKeyDown = (e) => this.#onKey(e, 'to');
	#onTrackClicked = (e) => this.#trackClicked(e);

	// Drag handlers (attached only during active drag)
	#onMouseMove = (e) => this.#onDragMove(e);
	#onMouseUp = () => this.#onDragEnd();
	#onTouchMove = (e) => this.#onDragMove(e);
	#onTouchEnd = () => this.#onDragEnd();

	/**
	 * Factory method to create a new DoubleRange instance and generate its DOM.
	 *
	 * @param {Object} o - Configuration object
	 * @param {string} o.selector - CSS selector for container element
	 * @param {number} o.min - Minimum value
	 * @param {number} o.max - Maximum value
	 * @param {number} o.from - Initial lower value
	 * @param {number} o.to - Initial upper value
	 * @param {number} o.step - Step increment
	 * @param {function} o.callback - OPTIONAL: Function called when values change
	 *   after o.delay, e.g. fn(from, to)
	 * @param {number} [o.delay=0] - OPTIONAL: Debounce delay (ms) for callback only
	 * @param {function} [o.formatter=(v)=>v] - OPTIONAL: Format values for display
	 * @param {string} [o.label="Range selector"] - OPTIONAL: ARIA label
 	 * @param {function} o.beforeFromChange - OPTIONAL: Function called 
 	 *	 before from value changes. Must return boolean - if false, change is prevented
 	 * @param {function} o.beforeToChange - OPTIONAL: Function called 
 	 *	 before to value changes. Must return boolean - if false, change is prevented
	 * @returns {DoubleRange} New instance
	 * @throws {TypeError|RangeError} If config is invalid
	 */
	static create(o) {
		if (!o || typeof o !== 'object') {
			throw new TypeError('config must be an object');
		}

		['selector'].forEach(k => {
			if (typeof o[k] !== 'string') {
				throw new TypeError(`${k} must be a string`);
			}
		});

		['min', 'max', 'from', 'to', 'step'].forEach(k => {
			if (typeof o[k] !== 'number') {
				throw new TypeError(`${k} must be a number`);
			}
		});

		if (o.from < o.min || o.from > o.max) {
			throw new RangeError('from value out of range');
		}
		if (o.to < o.min || o.to > o.max) {
			throw new RangeError('to value out of range');
		}
		if (o.from >= o.to) {
			throw new RangeError('from must be less than to');
		}

		if (typeof o.callback !== 'function') {
			throw new TypeError('callback must be a function');
		}

		if (typeof o.delay !== 'number') {
			o.delay = 0;
		}

		if (typeof o.formatter !== 'function') {
			o.formatter = (v) => v;
		}

		if (typeof o.label !== 'string') {
			o.label = "Range selector";
		}

		// Generate unique ID for ARIA and labeling
		DoubleRange.#counter++;
		const id = "doubleRange" + DoubleRange.#counter;
		const el = DoubleRange.#getElement(o.selector);
		el.textContent = '';
		el.insertAdjacentHTML('beforeend', `
			<div class="double-range">
				<div role="group" aria-label="${o.label}">
					<aside class="start point"></aside>
					<aside class="min limit">${o.formatter(o.min)}</aside>
					<label for="${id}-from" class="from">${o.formatter(o.from)}</label>
					<div class="track" role="none">
						<div class="thumb from" 
							id="${id}-from" 
							role="slider" 
							tabindex="0" 
							aria-orientation="horizontal" 
							aria-valuemin="${o.min}" 
							aria-valuemax="${o.max}" 
							aria-valuenow="${o.from}" 
							aria-valuetext="${o.formatter(o.from)}">
						</div>
						<div class="thumb to" 
							id="${id}-to" 
							role="slider" 
							tabindex="0" 
							aria-orientation="horizontal" 
							aria-valuemin="${o.min}" 
							aria-valuemax="${o.max}" 
							aria-valuenow="${o.to}" 
							aria-valuetext="${o.formatter(o.to)}">
						</div>
						<div class="range-bar"></div>
					</div>
					<label for="${id}-to" class="to">${o.formatter(o.to)}</label>
					<aside class="max limit">${o.formatter(o.max)}</aside>
					<aside class="end point"></aside>
				</div>
			</div>
		`);
		return new DoubleRange(o);
	}

	/**
	 * Constructor — Attach behavior to an existing DoubleRange DOM structure.
	 * 
	 * @param {Object} o - Configuration object (same as create)
	 * @throws {TypeError|Error} If config or DOM is invalid
	 */
	constructor(o) {
		if (typeof o.selector !== 'string') {
			throw new TypeError('selector must be a string');
		}

		if (typeof o.callback !== 'function') {
			throw new TypeError('callback must be a function');
		}

		if (typeof o.beforeFromChange == 'function') {
			this.#beforeFromChange = o.beforeFromChange;
		}

		if (typeof o.beforeToChange == 'function') {
			this.#beforeToChange = o.beforeToChange;
		}

		this.#delay = typeof o.delay === 'number' ? o.delay : 0;
		this.#formatter = typeof o.formatter === 'function' ? o.formatter : (v) => v;
		this.#callback = o.callback;

		const container = DoubleRange.#getElement(o.selector);

		// Prevent double initialization
		if (DoubleRange.#map.has(container)) {
			throw new Error('DoubleRange is already initialized on this element');
		}

		// Cache DOM elements
		this.#fromThumb = container.querySelector('.thumb.thumb.from');
		this.#toThumb = container.querySelector('.thumb.thumb.to');
		this.#fromLabel = container.querySelector('label.from');
		this.#toLabel = container.querySelector('label.to');
		this.#minLabel = container.querySelector('.min.limit');
		this.#maxLabel = container.querySelector('.max.limit');
		this.#track = container.querySelector('.track');

		// Validate required elements
		if (!this.#fromThumb || !this.#toThumb || !this.#track || !this.#fromLabel || !this.#toLabel) {
			throw new Error('Missing required elements');
		}

		// Initialize state from DOM attributes or config
		this.#min = parseFloat(this.#fromThumb.getAttribute('aria-valuemin'));
		this.#max = parseFloat(this.#fromThumb.getAttribute('aria-valuemax'));
		this.#step = o.step ?? 1;

		this.#fromValue = parseFloat(this.#fromThumb.getAttribute('aria-valuenow')) || o.from || this.#min;
		this.#toValue = parseFloat(this.#toThumb.getAttribute('aria-valuenow')) || o.to || this.#max;

		if (this.#fromValue >= this.#toValue) {
			throw new Error('Initial values: from must be less than to');
		}

		// Store instance for lookup
		this.#div = container.querySelector('.double-range');
		DoubleRange.#map.set(this.#div, this);

		// Observe for DOM removal (auto-destroy) or double-range div resize  
		let isInitObservation = true;
		this.#modifyObserver = new ResizeObserver(() => {
			if (isInitObservation) {
				isInitObservation = false;
				return;
			}
			if (!this.#div.isConnected) {
				this.destroy();
				return;
			}
			this.#setOuterRects();
		});
		this.#modifyObserver.observe(this.#div);
		this.#destroyed = false;

		// Update visuals immediately
		this.#setOuterRects();
		this.#positionThumbs();

		// Set up event listeners
		this.#initEvents();

		// fix the position of 'label from' based on its collision mark (::after) in it
		const afterStyle = window.getComputedStyle(this.#fromLabel, '::after');
		const afterStyleContent = afterStyle.content;
		if (afterStyleContent) {
			const transformValue = `translate(calc(-50% + ${afterStyle.width}), -50%)`;
			this.#fromLabel.style.transform = transformValue;
			this.#fromLabel.style.webkitTransform = transformValue;
		}
	}

	#setOuterRects = () => {
		this.#trackRect = this.#track.getBoundingClientRect();
		this.#divRect = this.#div.getBoundingClientRect();
		this.#updateFromToLabels();
		this.#updateMinMaxLabels();
	};

	/**
	 * Get instance by CSS selector
	 * @param {string} selector
	 * @returns {DoubleRange|null}
	 */
	static getBySelector(selector) {
		const container = DoubleRange.#getElement(selector);
		const div = container.querySelector('.double-range');
		if (!div) {
			return null;
		}
		return DoubleRange.#map.has(div) ? DoubleRange.#map.get(div) : null;
	}

	/**
	 * Get instance by DOM element
	 * @param {Element} container
	 * @returns {DoubleRange|null}
	 */
	static getByContainer(container) {
		const div = container.querySelector('.double-range');
		if (!div) {
			return null;
		}
		return DoubleRange.#map.has(div) ? DoubleRange.#map.get(div) : null;
	}

	/**
	 * Helper to safely select a single element
	 * @param {string} selector
	 * @returns {Element}
	 * @throws {Error} If not found or multiple match
	 * @private
	 */
	static #getElement(selector) {
		const els = document.querySelectorAll(selector);
		if (els.length === 0) throw new Error(`Element ${selector} not found`);
		if (els.length > 1) throw new Error(`Multiple elements match ${selector}`);
		return els[0];
	}

	// ——————————————————————
	// Track clicked
	// ——————————————————————
	#trackClicked(e) {
		const percent = (e.clientX - this.#trackRect.left) / this.#trackRect.width;
		const value = this.#min + percent * (this.#max - this.#min);
		const snapped = Math.round((value - this.#min) / this.#step) * this.#step + this.#min;

		// Decide which thumb to move
		if (Math.abs(snapped - this.#fromValue) < Math.abs(snapped - this.#toValue)) {
			this.setFrom(snapped);
		} else {
			this.setTo(snapped);
		}
	}


	// ——————————————————————
	// Event Setup
	// ——————————————————————

	/**
	 * Initialize permanent event listeners on thumbs
	 * @private
	 */
	#initEvents() {
		this.#fromThumb.addEventListener('mousedown', this.#onFromMouseDown);
		this.#toThumb.addEventListener('mousedown', this.#onToMouseDown);
		this.#fromThumb.addEventListener('touchstart', this.#onFromTouchStart
			, { passive: false });
		this.#toThumb.addEventListener('touchstart', this.#onToTouchStart
			, { passive: false });
		this.#fromThumb.addEventListener('keydown', this.#onFromKeyDown);
		this.#toThumb.addEventListener('keydown', this.#onToKeyDown);

		this.#track.addEventListener("click", this.#onTrackClicked);
	}

	// ——————————————————————
	// Drag Interaction
	// ——————————————————————

	/**
	 * Start dragging a thumb
	 * 
	 * During drag:
	 * - Clear any pending callbacks (user is still adjusting)
	 * - Set drag flags to prevent callback scheduling
	 * - Update z-index for visual feedback
	 * 
	 * @private
	 * @param {MouseEvent|TouchEvent} e
	 * @param {'from'|'to'} type
	 * @param {boolean} isTouch
	 */
	#onDragStart(e, type, isTouch = false) {
		e.preventDefault();

		// Set appropriate z-index for the dragging thumb
		if (type === "from") {
			this.#fromThumb.style.zIndex = 3;
			this.#toThumb.style.zIndex = 2;
			this.#fromThumb.classList.add('dragging');
		}
		else {
			this.#fromThumb.style.zIndex = 2;
			this.#toThumb.style.zIndex = 3;
			this.#toThumb.classList.add('dragging');
		}

		this.#isDragging = type;
		this.#duringDrag = true; // Flag to prevent callback scheduling during drag

		// Clear any pending callback (user is still adjusting)
		clearTimeout(this.#callbackTimer);

		// Attach global listeners only during drag
		document.addEventListener('mousemove', this.#onMouseMove);
		document.addEventListener('mouseup', this.#onMouseUp);
		document.addEventListener('touchmove', this.#onTouchMove, { passive: false });
		document.addEventListener('touchend', this.#onTouchEnd);

		document.body.classList.add('double-range-dragging');
	}

	/**
	 * Move the currently dragged thumb
	 * 
	 * During drag:
	 * - Only update UI (values, positions, labels)
	 * - Do NOT schedule callbacks (user is still adjusting)
	 * 
	 * @private
	 * @param {MouseEvent|TouchEvent} e
	 */
	#onDragMove(e) {
		if (!this.#isDragging) {
			return;
		}

		const clientX = e.clientX ?? e.touches?.[0]?.clientX;
		if (!clientX || !this.#trackRect) {
			return;
		}

		const percent = Math.max(0
			, Math.min(1, (clientX - this.#trackRect.left) / this.#trackRect.width));
		const value = this.#min + percent * (this.#max - this.#min);
		const snapped = Math.round((value - this.#min) / this.#step)
			* this.#step + this.#min;

		this.#setValue(this.#isDragging, snapped);
	}

	/**
	 * End dragging
	 * 
	 * After drag completes:
	 * - Reset drag state
	 * - Schedule final callback with debounce
	 * 
	 * @private
	 */
	#onDragEnd() {
		if (!this.#isDragging) {
			return
		};

		// Remove global listeners
		document.removeEventListener('mousemove', this.#onMouseMove);
		document.removeEventListener('mouseup', this.#onMouseUp);
		document.removeEventListener('touchmove', this.#onTouchMove);
		document.removeEventListener('touchend', this.#onTouchEnd);

		// Reset state
		this.#isDragging = null;
		this.#duringDrag = false; // Clear drag flag
		this.#fromThumb.classList.remove('dragging');
		this.#toThumb.classList.remove('dragging');

		// Schedule callback for final values after delay
		this.#scheduleCallback();

		document.body.classList.remove('double-range-dragging');
	}

	// ——————————————————————
	// Keyboard Support
	// ——————————————————————

	/**
	 * Handle keyboard input on thumbs
	 * 
	 * Keyboard interaction:
	 * - Immediate UI updates
	 * - Debounced callback (using #delay)
	 * 
	 * @private
	 * @param {KeyboardEvent} e
	 * @param {'from'|'to'} type
	 */
	#onKey(e, type) {
		const step = this.#step;
		let changed = false;

		switch (e.key) {
			case 'ArrowLeft':
			case 'ArrowDown':
				e.preventDefault();
				if (this.#getValue(type) - step >= this.#min) {
					this.#setValue(type, this.#getValue(type) - step);
					changed = true;
				}
				break;
			case 'ArrowRight':
			case 'ArrowUp':
				e.preventDefault();
				if (this.#getValue(type) + step <= this.#max) {
					this.#setValue(type, this.#getValue(type) + step);
					changed = true;
				}
				break;
		}

		if (changed) {
			// Keyboard changes schedule callbacks with debounce
			this.#scheduleCallback();
		}
	}

	// ——————————————————————
	// Internal Helpers
	// ——————————————————————

	/**
	 * Get current value by type
	 * @private
	 * @param {'from'|'to'} type
	 * @returns {number}
	 */
	#getValue(type) {
		return type === 'from' ? this.#fromValue : this.#toValue;
	}

	/**
	 * Set value with bounds and overlap checks
	 * 
	 * Behavior:
	 * - During drag: Update UI but don't schedule callbacks
	 * - After drag/keyboard: Update UI and schedule callback
	 * 
	 * @private
	 * @param {'from'|'to'} type
	 * @param {number} value
	 */
	#setValue(type, value) {
		if (type == "from") {
			this.setFrom(value);
		}
		else {
			this.setTo(value);
		}
	}

	// ——————————————————————
	// Visual Updates
	// ——————————————————————

	#updateMinMaxLabels() {
		this.#minLabel.textContent = this.#formatter(this.#min);
		this.#minLabel.style.left = '0px';
		const minRect = this.#minLabel.getBoundingClientRect();
		let realLeft = minRect.left - this.#divRect.left;
		if (realLeft < 0) {
			this.#minLabel.style.left = `${-1 * realLeft}px`;
		}

		this.#maxLabel.textContent = this.#formatter(this.#max);
		this.#maxLabel.style.right = '0px';
		const maxRect = this.#maxLabel.getBoundingClientRect();

		realLeft = maxRect.left - this.#divRect.left;
		const overflow = realLeft + maxRect.width - this.#divRect.width;
		if (overflow > 0) {
			this.#maxLabel.style.right = `${overflow}px`;
		}

	}

	/**
	 * Update fromLabel and toLabel texts and their positions
	 * Ensures fromLabel and toLabel do not overlap
	 * Uses CSS for transforms; JS only sets `left` and checks for collision
	 * @private
	 */
	#updateFromToLabels() {

		if (this.#hasLabelsCollision) {
			this.#div.classList.remove("collision");
		}
		this.#hasLabelsCollision = false;

		// Update text content first
		this.#fromLabel.textContent = this.#formatter(this.#fromValue);
		this.#toLabel.textContent = this.#formatter(this.#toValue);

		// Get percentage positions of thumbs
		const range = this.#max - this.#min;
		const fromPos = ((this.#fromValue - this.#min) / range) * 100;
		const toPos = ((this.#toValue - this.#min) / range) * 100;

		// Always set basic left position (used by CSS for layout)
		let fromX = `${fromPos}%`;
		let toX = `${toPos}%`;
		this.#fromLabel.style.left = fromX;
		this.#toLabel.style.left = toX;

		// Skip collision detection if labels aren't visible
		if (!this.#fromLabel.offsetParent || !this.#toLabel.offsetParent) {
			return;
		}

		// Get bounding rects
		let fromRect = this.#fromLabel.getBoundingClientRect();
		let toRect = this.#toLabel.getBoundingClientRect();

		// case: labels collide
		const collisionWidth = fromRect.left + fromRect.width - toRect.left;
		if (collisionWidth > 0) {
			this.#div.classList.add("collision");
			this.#hasLabelsCollision = true;
			const collisionDif = (collisionWidth / 2) + "px";
			fromX += ` - ${collisionDif}`;
			this.#fromLabel.style.left = `calc(${fromX})`;
			toX += ` + ${collisionDif}`;
			this.#toLabel.style.left = `calc(${toX})`;
			fromRect = this.#fromLabel.getBoundingClientRect();
			toRect = this.#toLabel.getBoundingClientRect();
		}

		// case: toLabel overflows right
		let realLeft = toRect.left - this.#divRect.left;
		const rightOverflow = realLeft + toRect.width - this.#divRect.width;
		if (rightOverflow > 0) {
			toX += ` - ${rightOverflow}px`;
			this.#toLabel.style.left = `calc(${toX})`;
			realLeft = fromRect.left - this.#divRect.left;
			let fromCollision = (realLeft + fromRect.width) - (this.#divRect.width - toRect.width);
			if (fromCollision > 0) {
				this.#div.classList.add("collision");
				this.#hasLabelsCollision = true;
				fromX += ` - ${fromCollision}px`;
				this.#fromLabel.style.left = `calc(${fromX})`;
			}
		}

		// case: fromLabel overflows left
		realLeft = fromRect.left - this.#divRect.left;
		if (realLeft < 0) {
			fromX += ` + ${-1 * realLeft}px`;
			this.#fromLabel.style.left = `calc(${fromX})`;
			realLeft = toRect.left - this.#divRect.left;
			if (realLeft < fromRect.width) {
				this.#div.classList.add("collision");
				this.#hasLabelsCollision = true;
				toX += ` + ${fromRect.width - realLeft}px`;
				this.#toLabel.style.left = `calc(${toX})`;
			}
		}
	}

	/**
	 * Position thumbs and fill bar based on current values
	 * Now uses only percentage values. Centering is done via CSS.
	 * CSS should use: `transform: translateX(-50%)` to center thumbs.
	 * @private
	 */
	#positionThumbs() {
		const range = this.#max - this.#min;
		const fromPos = ((this.#fromValue - this.#min) / range) * 100;
		const toPos = ((this.#toValue - this.#min) / range) * 100;

		this.#fromThumb.style.left = `${fromPos}%`;
		this.#toThumb.style.left = `${toPos}%`;

		const bar = this.#track.querySelector('.range-bar');
		bar.style.left = `${fromPos}%`;
		bar.style.width = `${toPos - fromPos}%`;
	}

	/**
	 * Schedule the user callback with debounce.
	 * 
	 * Behavior:
	 * - During drag: No callbacks scheduled
	 * - At drag end: Callback scheduled after #delay ms
	 * - Keyboard/programmatic changes: Callback debounced by #delay ms
	 * 
	 * @private
	 */
	#scheduleCallback() {
		clearTimeout(this.#callbackTimer);
		this.#callbackTimer = setTimeout(() => {
			this.#callback(this.#fromValue, this.#toValue);
			this.#div.dispatchEvent(
				new CustomEvent('range-change', {
					detail: { from: this.#fromValue, to: this.#toValue },
					bubbles: true
				})
			);
		}, this.#delay);
	}

	// ——————————————————————
	// Public API
	// ——————————————————————

	/**
	 * Set the minimum value of the range.
	 * 
	 * The new minimum must be:
	 * - Less than the current maximum
	 * - Less than or equal to the current 'from' value
	 * 
	 * @example
	 * slider.setMin(10); // Updates min and triggers callback
	 * slider.setMin(20, false); // Silent update (no callback)
	 * 
	 * @param {number} min - The new minimum value
	 * @param {boolean} [fireCallback=true] - Whether to trigger the callback after update
	 * 
	 * @throws {TypeError} If `min` is not a number
	 * @throws {RangeError} If constraints are violated
	 * 
	 * @returns {DoubleRange} `this` for method chaining
	 */
	setMin(min, fireCallback = true) {
		if (typeof min !== 'number') {
			throw new TypeError('DoubleRange.setMin: min must be a number');
		}
		if (min >= this.#max) {
			throw new RangeError(`DoubleRange.setMin: min (${min}) must be less than max (${this.#max})`);
		}
		if (min > this.#fromValue) {
			throw new RangeError(`DoubleRange.setMin: min (${min}) must be less than or equal to current from value (${this.#fromValue})`);
		}

		this.#min = min;
		this.#fromThumb.setAttribute('aria-valuemin', min);
		this.#toThumb.setAttribute('aria-valuemin', min);

		this.#updateFromToLabels();
		this.#updateMinMaxLabels();
		this.#positionThumbs();

		if (fireCallback) {
			this.#scheduleCallback();
		}

		return this;
	}

	/**
	 * Set the maximum value of the range.
	 * 
	 * The new maximum must be:
	 * - Greater than the current minimum
	 * - Greater than or equal to the current 'to' value
	 * 
	 * @example
	 * slider.setMax(90); // Updates max and triggers callback
	 * slider.setMax(100, false); // Silent update (no callback)
	 * 
	 * @param {number} max - The new maximum value
	 * @param {boolean} [fireCallback=true] - Whether to trigger the callback after update
	 * 
	 * @throws {TypeError} If `max` is not a number
	 * @throws {RangeError} If constraints are violated
	 * 
	 * @returns {DoubleRange} `this` for method chaining
	 */
	setMax(max, fireCallback = true) {
		if (typeof max !== 'number') {
			throw new TypeError('DoubleRange.setMax: max must be a number');
		}
		if (max <= this.#min) {
			throw new RangeError(`DoubleRange.setMax: max (${max}) must be greater than min (${this.#min})`);
		}
		if (max < this.#toValue) {
			throw new RangeError(`DoubleRange.setMax: max (${max}) must be greater than or equal to current to value (${this.#toValue})`);
		}

		this.#max = max;
		this.#fromThumb.setAttribute('aria-valuemax', max);
		this.#toThumb.setAttribute('aria-valuemax', max);

		this.#updateFromToLabels();
		this.#updateMinMaxLabels();
		this.#positionThumbs();

		if (fireCallback) {
			this.#scheduleCallback();
		}

		return this;
	}

	/**
	 * Set the lower thumb's selected value ('from').
	 * 
	 * The new 'from' value must be:
	 * - Within the current min and max range
	 * - Less than the current 'to' value
	 * 
	 * @example
	 * slider.setFrom(25); // Updates from and triggers callback
	 * slider.setFrom(30, false); // Silent update (no callback)
	 * 
	 * @param {number} from - The new lower value
	 * @param {boolean} [fireCallback=true] - Whether to trigger the callback after update
	 * 
	 * @throws {TypeError} If `from` is not a number
	 * 
	 * @returns {DoubleRange|boolean} `this` for method chaining if successful,
	 *		`false` if constraints are violated
	 */
	setFrom(from, fireCallback = true) {
		if (typeof from !== 'number') {
			throw new TypeError('DoubleRange.setFrom: from must be a number');
		}
		if (from < this.#min || from > this.#max) {
			return false;
		}
		if (from >= this.#toValue) {
			return false;
		}
		if (this.#beforeFromChange !== null
			&& !this.#beforeFromChange(from, this.#toValue)) {
			return false;
		}

		this.#fromValue = from;
		this.#fromThumb.setAttribute('aria-valuenow', from);
		this.#fromThumb.setAttribute('aria-valuetext', this.#formatter(from));

		this.#updateFromToLabels();
		this.#positionThumbs();

		if (fireCallback) {
			this.#scheduleCallback();
		}

		return this;
	}

	/**
	 * Set the upper thumb's selected value ('to').
	 * 
	 * The new 'to' value must be:
	 * - Within the current min and max range
	 * - Greater than the current 'from' value
	 * 
	 * @example
	 * slider.setTo(75); // Updates to and triggers callback
	 * slider.setTo(80, false); // Silent update (no callback)
	 * 
	 * @param {number} to - The new upper value
	 * @param {boolean} [fireCallback=true] - Whether to trigger the callback after update
	 * 
	 * @throws {TypeError} If `to` is not a number
	 * 
	 * @returns {DoubleRange|boolean} `this` for method chaining if successful,
	 *		`false` if constraints are violated
	 */
	setTo(to, fireCallback = true) {
		if (typeof to !== 'number') {
			throw new TypeError('DoubleRange.setTo: to must be a number');
		}
		if (to < this.#min || to > this.#max) {
			return false;
		}
		if (to <= this.#fromValue) {
			return false;
		}

		if (this.#beforeToChange !== null
			&& !this.#beforeToChange(this.#fromValue, to)) {
			return false;
		}


		this.#toValue = to;
		this.#toThumb.setAttribute('aria-valuenow', to);
		this.#toThumb.setAttribute('aria-valuetext', this.#formatter(to));

		this.#updateFromToLabels();
		this.#positionThumbs();

		if (fireCallback) {
			this.#scheduleCallback();
		}

		return this;
	}

	/**
	 * Bulk update multiple slider values at once.
	 * 
	 * Accepts an object with any combination of `min`, `max`, `from`, `to`.
	 * Unspecified values remain unchanged.
	 * 
	 * By default, fires the callback unless `fireCallback = false`.
	 * 
	 * @example
	 * slider.update({ from: 25 }); // Updates and triggers callback
	 * slider.update({ min: 0, max: 100 }, false); // Silent bulk update
	 * 
	 * @param {Object} o - Update options (all properties optional)
	 * @param {number} [o.min] - New minimum value
	 * @param {number} [o.max] - New maximum value
	 * @param {number} [o.from] - New lower thumb value
	 * @param {number} [o.to] - New upper thumb value
	 * @param {boolean} [fireCallback=true] - Whether to trigger the callback after update
	 * 
	 * @throws {TypeError} If `o` is not a plain object or any value is not a number
	 * @throws {RangeError} If values violate constraints (e.g., from >= to)
	 * 
	 * @returns {DoubleRange} `this` for method chaining
	 */
	update(o, fireCallback = true) {
		// Validate input: must be a plain object
		const isPlainObject = o &&
			typeof o === 'object' &&
			!Array.isArray(o) &&
			o.constructor === Object;

		if (!isPlainObject) {
			throw new TypeError('DoubleRange.update: Argument must be a plain object with optional keys: min, max, from, to');
		}

		// Preserve current values for any unspecified fields
		const current = {
			min: this.#min,
			max: this.#max,
			from: this.#fromValue,
			to: this.#toValue
		};

		// Normalize input: fill missing with current values
		const next = {};
		for (const key of ['min', 'max', 'from', 'to']) {
			next[key] = o[key] !== undefined ? o[key] : current[key];

			if (typeof next[key] !== 'number') {
				throw new TypeError(`DoubleRange.update: '${key}' must be a number`);
			}
		}

		// Validate logical constraints
		if (next.min >= next.max) {
			throw new RangeError(`DoubleRange.update: min (${next.min}) must be less than max (${next.max})`);
		}

		if (next.from < next.min || next.from > next.max) {
			throw new RangeError(`DoubleRange.update: from (${next.from}) must be between min (${next.min}) and max (${next.max})`);
		}

		if (next.to < next.min || next.to > next.max) {
			throw new RangeError(`DoubleRange.update: to (${next.to}) must be between min (${next.min}) and max (${next.max})`);
		}

		if (next.from >= next.to) {
			throw new RangeError(`DoubleRange.update: from (${next.from}) must be less than to (${next.to})`);
		}

		// Apply all new values
		this.#min = next.min;
		this.#max = next.max;
		this.#fromValue = next.from;
		this.#toValue = next.to;

		// Sync ARIA attributes
		this.#fromThumb.setAttribute('aria-valuemin', next.min);
		this.#fromThumb.setAttribute('aria-valuemax', next.max);
		this.#fromThumb.setAttribute('aria-valuenow', next.from);
		this.#fromThumb.setAttribute('aria-valuetext', this.#formatter(next.from));

		this.#toThumb.setAttribute('aria-valuemin', next.min);
		this.#toThumb.setAttribute('aria-valuemax', next.max);
		this.#toThumb.setAttribute('aria-valuenow', next.to);
		this.#toThumb.setAttribute('aria-valuetext', this.#formatter(next.to));

		// Update visuals
		this.#updateFromToLabels();
		this.#updateMinMaxLabels();
		this.#positionThumbs();

		// Schedule final callback
		if (fireCallback) {
			this.#scheduleCallback();
		}

		return this;
	}

	/**
	 * Get the current lower value
	 * @returns {number}
	 */
	getFrom() {
		return this.#fromValue;
	}

	/**
	 * Get the current upper value
	 * @returns {number}
	 */
	getTo() {
		return this.#toValue;
	}

	/**
	 * Get the current minimum bound
	 * @returns {number}
	 */
	getMin() {
		return this.#min;
	}

	/**
	 * Get the current maximum bound
	 * @returns {number}
	 */
	getMax() {
		return this.#max;
	}

	/**
	 * Get current range as object
	 * @returns {{ from: number, to: number }}
	 */
	getRange() {
		return { from: this.#fromValue, to: this.#toValue };
	}

	// ——————————————————————
	// Lifecycle
	// ——————————————————————

	/**
	 * Clean up all event listeners and observers.
	 * Safe to call multiple times.
	 */
	destroy() {
		if (this.#destroyed) {
			return;
		}

		// Remove local event listeners
		this.#fromThumb.removeEventListener('mousedown', this.#onFromMouseDown);
		this.#toThumb.removeEventListener('mousedown', this.#onToMouseDown);
		this.#fromThumb.removeEventListener('touchstart', this.#onFromTouchStart);
		this.#toThumb.removeEventListener('touchstart', this.#onToTouchStart);
		this.#fromThumb.removeEventListener('keydown', this.#onFromKeyDown);
		this.#toThumb.removeEventListener('keydown', this.#onToKeyDown);
		this.#track.removeEventListener("click", this.#onTrackClicked);

		// Clean up drag state
		if (this.#isDragging) {
			this.#onDragEnd();
		}

		// Disconnect observer
		if (this.#modifyObserver) {
			this.#modifyObserver.disconnect();
			this.#modifyObserver = null;
		}

		// Clear pending callback
		if (this.#callbackTimer) {
			clearTimeout(this.#callbackTimer);
			this.#callbackTimer = null;
		}

		// Remove from global map
		if (this.#div && DoubleRange.#map.has(this.#div)) {
			DoubleRange.#map.delete(this.#div);
		}

		// Mark as destroyed
		this.#destroyed = true;
	}
}