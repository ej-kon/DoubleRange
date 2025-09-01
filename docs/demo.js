
const demo = { a: 5 };

(function() {
	const t = this;
	t.init = function() {
		setExample1();
		setExample2();
		setExample3();
		setExample4();
		setExample5();
	}

	const setExample1 = () => {
		const formatterFn = (v) => `$ ${v}`;
		const callbackFn = (from, to) => { console.log(`example:1 from:${from} to:${to}`) };
		const slider = DoubleRange.create({
			selector: "#slider-1",
			min: 30,
			max: 500,
			from: 100,
			to: 400,
			step: 1,
			label: 'Example 1',
			formatter: formatterFn,
			delay: 300,
			callback: callbackFn
		});
	};

	const setExample2 = () => {
		const toEuro = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
		const callbackFn = (from, to) => { console.log(`example:2 from:${from} to:${to}`) };
		const slider = DoubleRange.create({
			selector: "#slider-2",
			min: 1015,
			max: 23050,
			from: 10000,
			to: 20000,
			step: 1,
			label: 'Example 2',
			formatter: toEuro,
			delay: 500,
			callback: callbackFn
		});
	};


	const setExample3 = () => {
		let slider = null;
		const beforeFromChangeFn = (from, to) => {
			if (to - from < 100) {
				slider.setFrom(to - 100);
				return false;
			}
			return true;
		};
		const beforeToChangeFn = (from, to) => {
			if (to - from < 100) {
				slider.setTo(from + 100);
				return false;
			}
			return true;
		};
		const formatterFn = (v) => `$ ${v}`;
		const callbackFn = (from, to) => { console.log(`example:3 from:${from} to:${to}`) };
		slider = DoubleRange.create({
			selector: "#slider-3",
			min: 30,
			max: 500,
			from: 100,
			to: 400,
			step: 1,
			label: 'Example 3',
			formatter: formatterFn,
			beforeFromChange: beforeFromChangeFn,
			beforeToChange: beforeToChangeFn,
			delay: 250,
			callback: callbackFn
		});
	};


	const setExample4 = () => {
		const dateFormatter = (local) => {
			const intl = new Intl.DateTimeFormat(local);
			const parts = intl.formatToParts(new Date(2000, 0, 1))
				.filter(p => p.type !== 'literal');
			const order = parts.reduce((o, p, i) => (o[p.type] = i, o), {});
			const msPerDay = 864e5;

			return {
				fromInt: v => intl.format(new Date(v * msPerDay)),
				toInt: s => {
					const v = s.split(/\D+/);
					const y = +v[order.year];
					const m = +v[order.month] - 1;
					const d = +v[order.day];
					return Date.UTC(y, m, d) / msPerDay | 0;
				}
			};
		};

		const formatter = dateFormatter("en-US");

		const callbackFn = (from, to) => {
			console.log(
				`example:4 from:${formatter.fromInt(from)} to:${formatter.fromInt(to)}`);
		};

		const slider = DoubleRange.create({
			selector: "#slider-4",
			min: formatter.toInt("01/01/2026"),
			max: formatter.toInt("12/31/2026"),
			from: formatter.toInt("03/01/2026"),
			to: formatter.toInt("05/15/2026"),
			step: 1,
			label: 'Example 4',
			formatter: formatter.fromInt,
			delay: 500,
			callback: callbackFn
		});
	};

	const setExample5 = () => {
		const inp = {
			from: document.getElementById('from-5'),
			to: document.getElementById('to-5'),
			min: document.getElementById('min-5'),
			max: document.getElementById('max-5'),
			result: document.getElementById('result-5')
		}
		const btn = {
			from: document.getElementById('set-from-5'),
			to: document.getElementById('set-to-5'),
			min: document.getElementById('set-min-5'),
			max: document.getElementById('set-max-5'),
		};

		const toEuro = (n) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ' €';
		const callbackFn = (from, to) => inp.result.value = `from:${from} to:${to}`;
		const slider = DoubleRange.create({
			selector: "#slider-5",
			min: 5400,
			max: 19600,
			from: 8398,
			to: 15325,
			step: 1,
			label: 'Example 5',
			formatter: toEuro,
			delay: 150,
			callback: callbackFn
		});

		const pointError = (el) => {
			el.value = "";
			el.classList.add("error");
			setTimeout(() => { el.classList.remove("error"); }, 300);
		};

		btn.from.addEventListener('click', () => {
			if (!slider.setFrom(parseInt(inp.from.value))) {
				// setFrom and setTo return false if the value is invalid
				pointError(inp.from);
			}
		});

		btn.to.addEventListener('click', () => {
			if (!slider.setTo(parseInt(inp.to.value))) {
				pointError(inp.to);
			}
		});

		btn.min.addEventListener('click', () => {
			// setMin and setMax throw an error if the value is invalid
			try {
				slider.setMin(parseInt(inp.min.value));
			}
			catch (e) {
				console.error(e);
				pointError(inp.min);
			}
		});

		btn.max.addEventListener('click', () => {
			try {
				slider.setMax(parseInt(inp.max.value));
			}
			catch (e) {
				console.error(e);
				pointError(inp.max);
			}
		});


	};
}).call(demo);