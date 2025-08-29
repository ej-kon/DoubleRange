
const demo = { a: 5 };

(function() {
	const t = this;
	t.init = function() {
		setExample1();
		setExample2();
		setExample3();
	}

	const setExample1 = () => {
		const formatterFn = (v) => `$ ${v}`;
		const callbackFn = (from, to) => { console.log(`example-1 from:${from} to:${to}`) };
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
		const callbackFn = (from, to) => { console.log(`example2 from:${from} to:${to}`) };
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
		const callbackFn = (from, to) => { console.log(`example3 from:${from} to:${to}`) };
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
}).call(demo);