/**
 * DoubleRange - Vanilla JavaScript Dual-Thumb Range Slider
 * (c) 2025-present – MIT licence
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

// Type definitions
type ThumbType = 'from' | 'to';
type DoubleRangeConfig = {
	selector: string;
	min: number;
	max: number;
	from: number;
	to: number;
	step: number;
	callback: (from: number, to: number) => void;
	delay?: number;
	formatter?: (value: number) => string;
	label?: string;
	beforeFromChange?: (from: number, to: number) => boolean;
	beforeToChange?: (from: number, to: number) => boolean;
};

type UpdateOptions = {
	min?: number;
	max?: number;
	from?: number;
	to?: number;
};

type RangeValues = {
	from: number;
	to: number;
};

class DoubleRange {
	// Static state
	static #counter = 0; // Unique ID counter for generated elements
	static #map = new WeakMap<HTMLElement, DoubleRange>(); // Map DOM container → instance (for lookup & cleanup)

	// Instance state flags
	#destroyed = false; // Prevents double-destroy
	#div: HTMLElement; // double-range container element
	#hasLabelsCollision = false; // if the from / to labels would be in collision

	// DOM references
	#track: HTMLElement; // Track background
	#fromThumb: HTMLElement; // Lower thumb
	#toThumb: HTMLElement; // Upper thumb
	#fromLabel: HTMLLabelElement; // Label for lower thumb
	#fromLabelContent: HTMLElement; // The contents of the label for lower thumb
	#toLabel: HTMLLabelElement; // Label for upper thumb
	#toLabelContent: HTMLElement; // The contents of the label for upper thumb  
	#minLabel: HTMLElement; // Static min value display
	#maxLabel: HTMLElement; // Static max value display

	// Configuration
	#formatter: ((value: number) => string) | null = null; // User function to format values for display
	#callback: ((from: number, to: number) => void) | null = null; // User callback (from, to)
	#delay = 0; // Debounce delay for callback
	#callbackTimer: number | null = null; // Timeout ID for debounced callback
	#beforeFromChange: ((from: number, to: number) => boolean) | null = null; // User function before from value changes
	#beforeToChange: ((from: number, to: number) => boolean) | null = null; // User function before from value changes

	// Internal state
	#minValue = 0; // Minimum allowed value
	#maxValue = 100; // Maximum allowed value
	#step = 1; // Step increment
	#fromValue = 0; // Current lower selected value
	#toValue = 100; // Current upper selected value
	#isDragging: ThumbType | null = null; // Currently dragging: 'from', 'to', or null
	#duringDrag = false; // Flag to prevent callback scheduling during drag
	#trackRect: DOMRect | null = null; // Cached bounding rect during drag (for performance)
	#divRect: DOMRect | null = null; // Cached bounding rect of the double-range div for labels positioning

	// ResizeObserver for auto-cleanup when DOM is removed
	#modifyObserver: ResizeObserver | null = null;

	// Bound event handlers (retain `this` context and allow removal)
	#onFromMouseDown = (e: MouseEvent) => this.#onDragStart(e, 'from');
	#onToMouseDown = (e: MouseEvent) => this.#onDragStart(e, 'to');
	#onFromTouchStart = (e: TouchEvent) => this.#onDragStart(e, 'from', true);
	#onToTouchStart = (e: TouchEvent) => this.#onDragStart(e, 'to', true);
	#onFromKeyDown = (e: KeyboardEvent) => this.#onKey(e, 'from');
	#onToKeyDown = (e: KeyboardEvent) => this.#onKey(e, 'to');
	#onTrackClicked = (e: MouseEvent) => this.#trackClicked(e);

	// Drag handlers (attached only during active drag)
	#onMouseMove = (e: MouseEvent) => this.#onDragMove(e);
	#onMouseUp = () => this.#onDragEnd();
	#onTouchMove = (e: TouchEvent) => this.#onDragMove(e);
	#onTouchEnd = () => this.#onDragEnd();

	/**
	 * Factory method to create a new DoubleRange instance and generate its DOM.
	 *
	 * @param {DoubleRangeConfig} o - Configuration object
	 * @returns {DoubleRange} New instance
	 * @throws {TypeError|RangeError} If config is invalid
	 */
	static create(o: DoubleRangeConfig): DoubleRange {
		if (!o || typeof o !== 'object') {
			throw new TypeError('config must be an object');
		}

		(['selector'] as const).forEach(k => {
			if (typeof o[k] !== 'string') {
				throw new TypeError(`${k} must be a string`);
			}
		});

		(['min', 'max', 'from', 'to', 'step'] as const).forEach(k => {
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
			o.formatter = (v: number) => v.toString();
		}

		if (typeof o.label !== 'string') {
			o.label = "Range selector";
		}

		// Generate unique ID for ARIA and labeling
		DoubleRange.#counter++;
		const id = "double-range-" + DoubleRange.#counter;
		const el = DoubleRange.#getElement(o.selector);
		el.textContent = '';
		el.insertAdjacentHTML('beforeend', `
      <div class="double-range">
        <div role="group" aria-label="${o.label}">
          <aside class="start point"></aside>
          <aside class="min limit">${o.formatter(o.min)}</aside>
          <label for="${id}-from" class="from"><span>${o.formatter(o.from)}</span></label>
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
          <label for="${id}-to" class="to"><span>${o.formatter(o.to)}</span></label>
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
	 * @param {DoubleRangeConfig} o - Configuration object (same as create)
	 * @throws {TypeError|Error} If config or DOM is invalid
	 */
	constructor(o: DoubleRangeConfig) {
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
		this.#formatter = typeof o.formatter === 'function' ? o.formatter : (v: number) => v.toString();
		this.#callback = o.callback;

		const container = DoubleRange.#getElement(o.selector);

		// Prevent double initialization
		if (DoubleRange.#map.has(container)) {
			throw new Error('DoubleRange is already initialized on this element');
		}

		// Cache DOM elements
		this.#fromThumb = container.querySelector('.thumb.from') as HTMLElement;
		this.#toThumb = container.querySelector('.thumb.to') as HTMLElement;
		this.#fromLabel = container.querySelector('label.from') as HTMLLabelElement;
		this.#fromLabelContent = this.#fromLabel.querySelector('span') as HTMLElement;
		this.#toLabel = container.querySelector('label.to') as HTMLLabelElement;
		this.#toLabelContent = this.#toLabel.querySelector('span') as HTMLElement;
		this.#minLabel = container.querySelector('.min.limit') as HTMLElement;
		this.#maxLabel = container.querySelector('.max.limit') as HTMLElement;
		this.#track = container.querySelector('.track') as HTMLElement;
		this.#div = container.querySelector('.double-range') as HTMLElement;

		// Validate required elements
		if (!this.#div || !this.#fromThumb || !this.#toThumb || !this.#track
			|| !this.#fromLabel || !this.#toLabel
			|| !this.#fromLabelContent || !this.#toLabelContent) {
			throw new Error('Missing required elements');
		}

		// Initialize state from DOM attributes or config
		this.#minValue = parseFloat(this.#fromThumb.getAttribute('aria-valuemin') || '0');
		this.#maxValue = parseFloat(this.#fromThumb.getAttribute('aria-valuemax') || '100');
		this.#step = o.step ?? 1;

		this.#fromValue = parseFloat(this.#fromThumb.getAttribute('aria-valuenow') || '0') || o.from || this.#minValue;
		this.#toValue = parseFloat(this.#toThumb.getAttribute('aria-valuenow') || '100') || o.to || this.#maxValue;

		if (this.#fromValue >= this.#toValue) {
			throw new Error('Initial values: from must be less than to');
		}

		// Store instance for lookup
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
			(this.#fromLabel.style as any).webkitTransform = transformValue;
		}
	}

	#setOuterRects = (): void => {
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
	static getBySelector(selector: string): DoubleRange | null {
		const container = DoubleRange.#getElement(selector);
		const div = container.querySelector('.double-range') as HTMLElement | null;
		if (!div) {
			return null;
		}
		return DoubleRange.#map.has(div) ? DoubleRange.#map.get(div) || null : null;
	}

	/**
	 * Get instance by DOM element
	 * @param {Element} container
	 * @returns {DoubleRange|null}
	 */
	static getByContainer(container: Element): DoubleRange | null {
		const div = container.querySelector('.double-range') as HTMLElement | null;
		if (!div) {
			return null;
		}
		return DoubleRange.#map.has(div) ? DoubleRange.#map.get(div) || null : null;
	}

	/**
	 * Helper to safely select a single element
	 * @param {string} selector
	 * @returns {HTMLElement}
	 * @throws {Error} If not found or multiple match
	 */
	static #getElement(selector: string): HTMLElement {
		const els = document.querySelectorAll(selector);
		if (els.length === 0) {
			throw new Error(`Element ${selector} not found`);
		}
		if (els.length > 1) {
			throw new Error(`Multiple elements match ${selector}`);
		}
		const element = els[0];
		if (!(element instanceof HTMLElement)) {
			throw new Error(`Element ${selector} is not an HTMLElement`);
		}
		return element;
	}

	// ——————————————————————
	// Track clicked
	// ——————————————————————
	#trackClicked(e: MouseEvent): void {
		// Add a check to satisfy the compiler and handle potential edge cases
		if (!this.#trackRect) {
			console.warn('trackRect is not initialized in trackClicked');
			return;
		}
		
		const percent = (e.clientX - this.#trackRect.left) / this.#trackRect.width;
		const value = this.#minValue + percent * (this.#maxValue - this.#minValue);
		const snapped = Math.round((value - this.#minValue) / this.#step) * this.#step
			+ this.#minValue;

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
	 */
	#initEvents(): void {
		this.#fromThumb.addEventListener('mousedown', this.#onFromMouseDown);
		this.#fromThumb.addEventListener('touchstart', this.#onFromTouchStart, { passive: false });
		this.#fromThumb.addEventListener('keydown', this.#onFromKeyDown);

		this.#toThumb.addEventListener('mousedown', this.#onToMouseDown);
		this.#toThumb.addEventListener('touchstart', this.#onToTouchStart, { passive: false });
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
	 * @param {MouseEvent|TouchEvent} e
	 * @param {'from'|'to'} type
	 * @param {boolean} isTouch
	 */
	#onDragStart(e: MouseEvent | TouchEvent, type: ThumbType, isTouch = false): void {
		e.preventDefault();

		// Set appropriate z-index for the dragging thumb
		if (type === "from") {
			this.#fromThumb.style.zIndex = "3";
			this.#toThumb.style.zIndex = "2";
			this.#fromThumb.classList.add('dragging');
		}
		else {
			this.#fromThumb.style.zIndex = "2";
			this.#toThumb.style.zIndex = "3";
			this.#toThumb.classList.add('dragging');
		}

		this.#isDragging = type;
		this.#duringDrag = true; // Flag to prevent callback scheduling during drag

		// Clear any pending callback (user is still adjusting)
		if (this.#callbackTimer) {
			clearTimeout(this.#callbackTimer);
		}

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
	 * @param {MouseEvent|TouchEvent} e
	 */
	#onDragMove(e: MouseEvent | TouchEvent): void {
		if (!this.#isDragging || !this.#trackRect) {
			return;
		}

		const clientX = 'clientX' in e ? e.clientX : (e.touches?.[0]?.clientX || 0);
		if (!clientX) {
			return;
		}

		const percent = Math.max(0, Math.min(1, (clientX - this.#trackRect.left) / this.#trackRect.width));
		const value = this.#minValue + percent * (this.#maxValue - this.#minValue);
		const snapped = Math.round((value - this.#minValue) / this.#step) * this.#step
			+ this.#minValue;

		this.#setValue(this.#isDragging, snapped);
	}

	/**
	 * End dragging
	 * 
	 * After drag completes:
	 * - Reset drag state
	 * - Schedule final callback with debounce
	 */
	#onDragEnd(): void {
		if (!this.#isDragging) {
			return;
		}

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
	 * @param {KeyboardEvent} e
	 * @param {'from'|'to'} type
	 */
	#onKey(e: KeyboardEvent, type: ThumbType): void {
		const step = this.#step;
		let changed = false;

		switch (e.key) {
			case 'ArrowLeft':
			case 'ArrowDown':
				e.preventDefault();
				if (this.#getValue(type) - step >= this.#minValue) {
					this.#setValue(type, this.#getValue(type) - step);
					changed = true;
				}
				break;
			case 'ArrowRight':
			case 'ArrowUp':
				e.preventDefault();
				if (this.#getValue(type) + step <= this.#maxValue) {
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
	 * @param {'from'|'to'} type
	 * @returns {number}
	 */
	#getValue(type: ThumbType): number {
		return type === 'from' ? this.#fromValue : this.#toValue;
	}

	/**
	 * Set value with bounds and overlap checks
	 * 
	 * Behavior:
	 * - During drag: Update UI but don't schedule callbacks
	 * - After drag/keyboard: Update UI and schedule callback
	 * 
	 * @param {'from'|'to'} type
	 * @param {number} value
	 */
	#setValue(type: ThumbType, value: number): void {
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

	#updateMinMaxLabels(): void {
		if (!this.#formatter || !this.#divRect) return;

		this.#minLabel.textContent = this.#formatter(this.#minValue);
		this.#minLabel.style.left = '0px';
		const minRect = this.#minLabel.getBoundingClientRect();
		let realLeft = minRect.left - this.#divRect.left;
		if (realLeft < 0) {
			this.#minLabel.style.left = `${-1 * realLeft}px`;
		}

		this.#maxLabel.textContent = this.#formatter(this.#maxValue);
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
	 */
	#updateFromToLabels(): void {
		if (!this.#formatter) return;

		if (this.#hasLabelsCollision) {
			this.#div.classList.remove("collision");
		}
		this.#hasLabelsCollision = false;

		// Update text content first
		this.#fromLabelContent.textContent = this.#formatter(this.#fromValue);
		this.#toLabelContent.textContent = this.#formatter(this.#toValue);

		// Get percentage positions of thumbs
		const range = this.#maxValue - this.#minValue;
		const fromPos = ((this.#fromValue - this.#minValue) / range) * 100;
		const toPos = ((this.#toValue - this.#minValue) / range) * 100;

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
		if (!this.#divRect) return;
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
	 */
	#positionThumbs(): void {
		const range = this.#maxValue - this.#minValue;
		const fromPos = ((this.#fromValue - this.#minValue) / range) * 100;
		const toPos = ((this.#toValue - this.#minValue) / range) * 100;

		this.#fromThumb.style.left = `${fromPos}%`;
		this.#toThumb.style.left = `${toPos}%`;

		const bar = this.#track.querySelector('.range-bar') as HTMLElement;
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
	 */
	#scheduleCallback(): void {
		if (this.#callbackTimer) {
			clearTimeout(this.#callbackTimer);
		}
		if(this.#duringDrag)
		{
			return;
		}
		this.#callbackTimer = window.setTimeout(() => {
			if (this.#callback) {
				this.#callback(this.#fromValue, this.#toValue);
			}

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
	 * @throws {RangeError} If constraints are violated
	 * 
	 * @returns {DoubleRange} `this` for method chaining
	 */
	setMin(min: number, fireCallback = true): this {
		if (min >= this.#maxValue) {
			throw new RangeError(`DoubleRange.setMin: min (${min}) must be less than max (${this.#maxValue})`);
		}
		if (min > this.#fromValue) {
			throw new RangeError(`DoubleRange.setMin: min (${min}) must be less than or equal to current from value (${this.#fromValue})`);
		}

		this.#minValue = min;
		this.#fromThumb.setAttribute('aria-valuemin', min.toString());
		this.#toThumb.setAttribute('aria-valuemin', min.toString());

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
	 * @throws {RangeError} If constraints are violated
	 * 
	 * @returns {DoubleRange} `this` for method chaining
	 */
	setMax(max: number, fireCallback = true): this {
		if (max <= this.#minValue) {
			throw new RangeError(`DoubleRange.setMax: max (${max}) must be greater than min (${this.#minValue})`);
		}
		if (max < this.#toValue) {
			throw new RangeError(`DoubleRange.setMax: max (${max}) must be greater than or equal to current to value (${this.#toValue})`);
		}

		this.#maxValue = max;
		this.#fromThumb.setAttribute('aria-valuemax', max.toString());
		this.#toThumb.setAttribute('aria-valuemax', max.toString());

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
	 * @returns {DoubleRange|boolean} `this` for method chaining if successful,
	 *    `false` if constraints are violated
	 */
	setFrom(from: number, fireCallback = true): this | false {
		if (from < this.#minValue || from > this.#maxValue) {
			return false;
		}
		if (from >= this.#toValue) {
			this.setFrom(this.#toValue - this.#step); 
			return false;
		}
		if(from === this.#toValue)
		{
			return false; 
		}
				
		if (this.#beforeFromChange !== null
			&& !this.#beforeFromChange(from, this.#toValue)) {
			return false;
		}

		this.#fromValue = from;
		if (this.#formatter) {
			this.#fromThumb.setAttribute('aria-valuenow', from.toString());
			this.#fromThumb.setAttribute('aria-valuetext', this.#formatter(from));
		}

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
	 * @returns {DoubleRange|boolean} `this` for method chaining if successful,
	 *    `false` if constraints are violated
	 */
	setTo(to: number, fireCallback = true): this | false {
		if (to < this.#minValue || to > this.#maxValue) {
			return false;
		}
		if (to <= this.#fromValue) {
			this.setTo(this.#fromValue + this.#step);
			return false;
		}
		if(to === this.#toValue)
		{
			return false; 
		}
		
		if (this.#beforeToChange !== null
			&& !this.#beforeToChange(this.#fromValue, to)) {
			return false;
		}

		this.#toValue = to;
		if (this.#formatter) {
			this.#toThumb.setAttribute('aria-valuenow', to.toString());
			this.#toThumb.setAttribute('aria-valuetext', this.#formatter(to));
		}

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
	 * @param {UpdateOptions} o - Update options (all properties optional)
	 * @param {boolean} [fireCallback=true] - Whether to trigger the callback after update
	 * 
	 * @throws {TypeError} If `o` is not a plain object or any value is not a number
	 * @throws {RangeError} If values violate constraints (e.g., from >= to)
	 * 
	 * @returns {DoubleRange} `this` for method chaining
	 */
	update(o: UpdateOptions, fireCallback = true): this {
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
			min: this.#minValue,
			max: this.#maxValue,
			from: this.#fromValue,
			to: this.#toValue
		};

		// Normalize input: fill missing with current values
		const next = {} as { min: number; max: number; from: number; to: number; };
		for (const key of ['min', 'max', 'from', 'to'] as const) {
			// Assert that the result is a number
			next[key] = (o[key] !== undefined ? o[key] : current[key]) as number;
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
		this.#minValue = next.min;
		this.#maxValue = next.max;
		this.#fromValue = next.from;
		this.#toValue = next.to;

		// Sync ARIA attributes
		if (this.#formatter) {
			this.#fromThumb.setAttribute('aria-valuemin', next.min.toString());
			this.#fromThumb.setAttribute('aria-valuemax', next.max.toString());
			this.#fromThumb.setAttribute('aria-valuenow', next.from.toString());
			this.#fromThumb.setAttribute('aria-valuetext', this.#formatter(next.from));
		}

		this.#toThumb.setAttribute('aria-valuemin', next.min.toString());
		this.#toThumb.setAttribute('aria-valuemax', next.max.toString());
		if (this.#formatter) {
			this.#toThumb.setAttribute('aria-valuenow', next.to.toString());
			this.#toThumb.setAttribute('aria-valuetext', this.#formatter(next.to));
		}

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
	getFrom(): number {
		return this.#fromValue;
	}

	/**
	 * Get the current upper value
	 * @returns {number}
	 */
	getTo(): number {
		return this.#toValue;
	}

	/**
	 * Get the current minimum bound
	 * @returns {number}
	 */
	getMin(): number {
		return this.#minValue;
	}

	/**
	 * Get the current maximum bound
	 * @returns {number}
	 */
	getMax(): number {
		return this.#maxValue;
	}

	/**
	 * Get current range as object
	 * @returns {RangeValues}
	 */
	getRange(): RangeValues {
		return { from: this.#fromValue, to: this.#toValue };
	}

	// ——————————————————————
	// Lifecycle
	// ——————————————————————

	/**
	 * Clean up all event listeners and observers.
	 * Safe to call multiple times.
	 */
	destroy(): void {
		if (this.#destroyed) {
			return;
		}

		// Remove local event listeners
		this.#fromThumb.removeEventListener('mousedown', this.#onFromMouseDown);
		this.#fromThumb.removeEventListener('touchstart', this.#onFromTouchStart);
		this.#fromThumb.removeEventListener('keydown', this.#onFromKeyDown);

		this.#toThumb.removeEventListener('mousedown', this.#onToMouseDown);
		this.#toThumb.removeEventListener('touchstart', this.#onToTouchStart);
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
		if (DoubleRange.#map.has(this.#div)) {
			DoubleRange.#map.delete(this.#div);
		}

		// Mark as destroyed
		this.#destroyed = true;
	}
}