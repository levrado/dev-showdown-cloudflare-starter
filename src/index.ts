import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { generateText } from 'ai';
import { z } from 'zod';

const INTERACTION_ID_HEADER = 'X-Interaction-Id';

export default {
	async fetch(request: Request, env: Env): Promise<Response> {
		const url = new URL(request.url);

		if (request.method !== 'POST' || url.pathname !== '/api') {
			return new Response('Not Found', { status: 404 });
		}

		const challengeType = url.searchParams.get('challengeType');
		if (!challengeType) {
			return new Response('Missing challengeType query parameter', {
				status: 400,
			});
		}

		const interactionId = request.headers.get(INTERACTION_ID_HEADER);
		if (!interactionId) {
			return new Response(`Missing ${INTERACTION_ID_HEADER} header`, {
				status: 400,
			});
		}

		const payload = await request.json<any>();

		switch (challengeType) {
			case 'HELLO_WORLD':
				return Response.json({
					greeting: `Hello ${payload.name}`,
				});
			case 'BASIC_LLM': {
				if (!env.DEV_SHOWDOWN_API_KEY) {
					throw new Error('DEV_SHOWDOWN_API_KEY is required');
				}

				const workshopLlm = createWorkshopLlm(env.DEV_SHOWDOWN_API_KEY, interactionId);
				const result = await generateText({
					model: workshopLlm.chatModel('deli-4'),
					system: 'You are a trivia question player. Answer the question correctly and concisely.',
					prompt: payload.question,
				});

				return Response.json({
					answer: result.text || 'N/A',
				});
			}
			case 'JSON_MODE': {
				if (!env.DEV_SHOWDOWN_API_KEY) {
					throw new Error('DEV_SHOWDOWN_API_KEY is required');
				}

				const productSchema = z.object({
					name: z.string(),
					price: z.number(),
					currency: z.string(),
					inStock: z.boolean(),
					dimensions: z.object({
						length: z.number(),
						width: z.number(),
						height: z.number(),
						unit: z.string(),
					}),
					manufacturer: z.object({
						name: z.string(),
						country: z.string(),
						website: z.string(),
					}),
					specifications: z.object({
						weight: z.number(),
						weightUnit: z.string(),
						warrantyMonths: z.number(),
					}),
				});

				const workshopLlm = createWorkshopLlm(env.DEV_SHOWDOWN_API_KEY, interactionId);
				const result = await generateText({
					model: workshopLlm.chatModel('deli-4'),
					system: `Extract product information from the description and return a JSON object with exactly this shape:
{
  "name": string,
  "price": number,
  "currency": string (3-letter code),
  "inStock": boolean,
  "dimensions": { "length": number, "width": number, "height": number, "unit": string },
  "manufacturer": { "name": string, "country": string, "website": string },
  "specifications": { "weight": number, "weightUnit": string, "warrantyMonths": number }
}
Return only the JSON object, no markdown, no explanation.`,
					prompt: payload.description,
				});

				const raw = result.text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
				const object = productSchema.parse(JSON.parse(raw));
				return Response.json(object);
			}
			default:
					return new Response('Solver not found', { status: 404 });
			}
		},
	} satisfies ExportedHandler<Env>;

function createWorkshopLlm(apiKey: string, interactionId: string) {
	return createOpenAICompatible({
		name: 'dev-showdown',
		baseURL: 'https://devshowdown.com/v1',
		supportsStructuredOutputs: true,
		headers: {
			Authorization: `Bearer ${apiKey}`,
			[INTERACTION_ID_HEADER]: interactionId,
		},
	});
}
