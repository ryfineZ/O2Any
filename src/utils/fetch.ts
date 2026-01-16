import { requestUrl } from 'obsidian';

function normalizeBody(body: unknown): string | ArrayBuffer | undefined {
  if (typeof body === 'string' || body === undefined) {
    return body;
  }

  if (body instanceof ArrayBuffer) {
    return body;
  }

  if (ArrayBuffer.isView(body)) {
    const view = new Uint8Array(body.buffer, body.byteOffset, body.byteLength);
    return view.slice().buffer; // 拷贝出一段 ArrayBuffer
  }

  throw new Error('Unsupported body type passed to requestUrl');
}

export const obsidianFetch: typeof fetch = async (url, init) => {
  const method = init?.method ?? 'GET';
  const headers = init?.headers as Record<string, string> | undefined;
  
  const body = normalizeBody(init?.body);
  let urlString: string;
  if (typeof url === 'string') {
    urlString = url;
  } else if (url instanceof URL) {
    urlString = url.href;
  } else if (url instanceof Request) {
    urlString = url.url;
  } else {
    throw new Error('Unsupported request URL type');
  }
  const param = {
    url: urlString,
    method:method,
	//@ts-ignore
    headers: {
		'Content-Type': 'application/json',
		'Authorization': headers!.authorization}, 
	body: body,
  }

	return await requestUrl(param
		).then(
		(res) => {
			return {
			  ok: res.status >= 200 && res.status < 300,
			  status: res.status,
			  statusText: '', // Obsidian 没有 statusText 字段
			  headers: new Headers(res.headers),
			  json: () => Promise.resolve(JSON.parse(res.text)),
			  text: () => Promise.resolve(res.text),
			  arrayBuffer: () => Promise.resolve(new TextEncoder().encode(res.text).buffer),
			} as Response;
		},
	  ).catch((e) => {
		return {
		  ok: false,
		  status: 500,
		  statusText: 'Internal Server Error',
		  headers: new Headers(),
		  json: () => Promise.resolve({ error: e }),
		  text: () => Promise.resolve(e.toString()),
		  arrayBuffer: () => Promise.resolve(new TextEncoder().encode(e.toString()).buffer),	
		} as Response;	
	});
};
