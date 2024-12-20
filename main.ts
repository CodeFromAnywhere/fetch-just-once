import { DurableObject } from 'cloudflare:workers';

export class URLFetcherDO extends DurableObject {
	private activeFetches: Map<string, Promise<Response>>;

	constructor(state: DurableObjectState, env: Env) {
		super(state, env);
		this.activeFetches = new Map();
	}

	async fetch(request: Request): Promise<Response> {
		const url = new URL(request.url).searchParams.get('url');
		if (!url) {
			return new Response('No URL provided', { status: 400 });
		}

		// If there's already a fetch in progress, wait for it
		if (this.activeFetches.has(url)) {
			const response = await this.activeFetches.get(url)!;
			return response.clone(); // Clone the response for each requester
		}

		// Create a new fetch promise
		const fetchPromise = (async () => {
			try {
				// wait 10s to test
				await new Promise<void>((resolve) => setTimeout(() => resolve(), 10000));

				const response = await fetch(url);
				const data = await response.text();
				return new Response(data, {
					status: response.status,
					headers: {
						'Content-Type': response.headers.get('Content-Type') || 'text/plain',
					},
				});
			} catch (error: any) {
				return new Response(error.message, { status: 500 });
			} finally {
				// Clean up after the fetch is done
				this.activeFetches.delete(url);
			}
		})();

		// Store the promise for other requests to wait on
		this.activeFetches.set(url, fetchPromise);

		return fetchPromise;
	}
}

export default {
	async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
		const url = new URL(request.url).searchParams.get('url');
		if (!url) {
			return new Response('No URL provided', { status: 400 });
		}

		const id = env.URL_FETCHER_DO.idFromName(url);
		const stub = env.URL_FETCHER_DO.get(id);
		return stub.fetch(request);
	},
} satisfies ExportedHandler<Env>;
