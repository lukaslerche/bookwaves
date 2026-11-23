import fs from 'fs';
import { describe, expect, it } from 'vitest';
import { parseConfigSource } from './config';

const MINIMAL = `
lms:
  type: mock
middleware_instances:
  - id: mock1
    type: mock
`;

const cart = (binId: string, when: string) => `
  - binId: ${binId}
    color: yellow
    label: { de: 'Wagen', en: 'Cart' }
    message: { de: 'Bitte hier ablegen.', en: 'Please place it here.' }
    when: ${when}
`;

const CATCH_ALL = cart('main', '{ always: true }');
const REQUESTED = cart('reserved', '{ any: [{ field: has_request, equals: true }] }');

const profile = (id: string, extra = '') => `
    - id: ${id}
      library: MAIN
      circulation_desk: DESK
${extra}`;

describe('parseConfigSource', () => {
	it('accepts the shipped example configuration', () => {
		const config = parseConfigSource(
			fs.readFileSync(new URL('../../../config.example.yaml', import.meta.url), 'utf8')
		);

		expect(config.middlewareConfigProblems).toEqual([]);
		expect(config.checkout?.profiles?.length).toBeGreaterThan(0);
	});

	it('requires lms.type', () => {
		expect(() => parseConfigSource('middleware_instances: []')).toThrow('lms.type is required');
	});

	it.each(['null', '42', '[]', '{}', '{ id: bad }', '{ id: bad, type: 42 }'])(
		'rejects malformed middleware entry %s with its configuration path',
		(entry) => {
			expect(() => parseConfigSource(`${MINIMAL}  - ${entry}\n`)).toThrow(
				'middleware_instances[1] must be an object with non-empty string id and type'
			);
		}
	);

	it('reports an unrecognised middleware type without refusing to load', () => {
		const config = parseConfigSource(`
lms:
  type: mock
middleware_instances:
  - id: good
    type: mock
  - id: typo
    type: fieg
`);

		expect(config.middlewareConfigProblems).toEqual([
			{
				id: 'typo',
				type: 'fieg',
				message:
					'Middleware "typo" has unrecognised type "fieg". Recognised types: mock, feig, http.'
			}
		]);
	});

	it.each(['feig', 'http', 'HTTP', 'mock'])('recognises middleware type %s', (type) => {
		const config = parseConfigSource(`
lms:
  type: mock
middleware_instances:
  - id: m
    type: ${type}
`);

		expect(config.middlewareConfigProblems).toEqual([]);
	});

	it('defaults the checkout idle timeout to 60 seconds', () => {
		expect(parseConfigSource(MINIMAL).checkout?.idle_timeout_seconds).toBe(60);
	});

	it('uses the configured checkout idle timeout in seconds', () => {
		const config = parseConfigSource(`${MINIMAL}
checkout:
  idle_timeout_seconds: 90
`);
		expect(config.checkout?.idle_timeout_seconds).toBe(90);
	});

	it.each(['0', '-1', '0.5', '"90"', 'null', '.inf'])(
		'rejects invalid checkout idle timeout %s',
		(value) => {
			expect(() =>
				parseConfigSource(`${MINIMAL}
checkout:
  idle_timeout_seconds: ${value}
`)
			).toThrow('checkout.idle_timeout_seconds must be a positive integer');
		}
	);

	it('rejects a duplicated checkout profile id', () => {
		const source = `${MINIMAL}
checkout:
  profiles:${profile('desk')}${profile('desk')}`;

		expect(() => parseConfigSource(source)).toThrow('duplicate checkout.profiles id "desk"');
	});

	describe('return directives', () => {
		it('are off when global_return_directives is absent', () => {
			const config = parseConfigSource(`${MINIMAL}
checkout:
  profiles:${profile('desk')}`);

			expect(config.checkout?.profiles?.[0].return_directives).toEqual([]);
		});

		it('require a catch-all so no returned item goes without a cart', () => {
			const source = `${MINIMAL}
global_return_directives:${REQUESTED}
checkout:
  profiles:${profile('desk')}`;

			expect(() => parseConfigSource(source)).toThrow('catch-all directive');
		});

		it('reject a duplicated binId', () => {
			const source = `${MINIMAL}
global_return_directives:${CATCH_ALL}${CATCH_ALL}
checkout:
  profiles:${profile('desk')}`;

			expect(() => parseConfigSource(source)).toThrow('duplicate global_return_directives binId');
		});

		it('are inherited by a profile that names none', () => {
			const config = parseConfigSource(`${MINIMAL}
global_return_directives:${REQUESTED}${CATCH_ALL}
checkout:
  profiles:${profile('desk')}`);

			expect(config.checkout?.profiles?.[0].return_directives.map((d) => d.binId)).toEqual([
				'reserved',
				'main'
			]);
		});

		it('can be opted out of by one profile with an empty list', () => {
			const config = parseConfigSource(`${MINIMAL}
global_return_directives:${CATCH_ALL}
checkout:
  profiles:${profile('desk', '      return_directives: []')}`);

			expect(config.checkout?.profiles?.[0].return_directives).toEqual([]);
		});

		it('let a profile override only the keys it sets', () => {
			const config = parseConfigSource(`${MINIMAL}
global_return_directives:${CATCH_ALL}
checkout:
  profiles:${profile('desk', '      return_directives:\n        - binId: main\n          color: red')}`);

			const [directive] = config.checkout?.profiles?.[0].return_directives ?? [];
			expect(directive.color).toBe('red');
			expect(directive.label).toEqual({ de: 'Wagen', en: 'Cart' });
		});

		it.each([
			[undefined, '/branding/main.png'],
			['/branding/desk.png', '/branding/desk.png'],
			[null, undefined],
			['https://example.com/cart.png', 'https://example.com/cart.png'],
			['http://example.com/cart.png', 'http://example.com/cart.png'],
			['file:///branding/cart.png', undefined],
			['//example.com/cart.png', undefined],
			['/\\example.com/cart.png', undefined],
			['cart.png', undefined]
		])('resolves a return cart photo with profile image %s', (image, expected) => {
			const override = image === undefined ? '' : `\n          image: ${JSON.stringify(image)}`;
			const config = parseConfigSource(`${MINIMAL}
global_return_directives:${CATCH_ALL}    image: '/branding/main.png'
checkout:
  profiles:${profile('desk', `      return_directives:\n        - binId: main${override}`)}`);

			const directive = config.checkout?.profiles?.[0].return_directives[0];
			expect(directive?.binId).toBe('main');
			expect(directive?.image).toBe(expected);
		});

		it('reject a profile entry naming a bin the global list does not define', () => {
			const source = `${MINIMAL}
global_return_directives:${CATCH_ALL}
checkout:
  profiles:${profile('desk', '      return_directives:\n        - binId: nowhere')}`;

			expect(() => parseConfigSource(source)).toThrow('"nowhere" has no matching entry');
		});

		it('reject a profile list that drops the catch-all', () => {
			const source = `${MINIMAL}
global_return_directives:${REQUESTED}${CATCH_ALL}
checkout:
  profiles:${profile('desk', '      return_directives:\n        - binId: reserved')}`;

			expect(() => parseConfigSource(source)).toThrow('catch-all directive');
		});
	});
});
