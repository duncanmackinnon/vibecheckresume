import { NextRequest } from 'next/server';

export async function logRequest(request: NextRequest) {
  console.log('API Request:', {
    method: request.method,
    url: request.url,
    headers: Object.fromEntries(request.headers.entries()),
  });

  // Log FormData if present
  if (request.headers.get('content-type')?.includes('multipart/form-data')) {
    try {
      const clone = request.clone();
      const formData = await clone.formData();
      console.log('FormData contents:', {
        fields: Array.from(formData.entries()).map(([key, value]) => ({
          key,
          type: value instanceof File ? 'File' : 'string',
          size: value instanceof File ? value.size : value.length,
        })),
      });
    } catch (error) {
      console.error('Error parsing FormData:', error);
    }
  }
}

export async function logResponse(response: Response) {
  console.log('API Response:', {
    status: response.status,
    statusText: response.statusText,
    headers: Object.fromEntries(response.headers.entries()),
  });

  // Clone the response before reading its body
  const clone = response.clone();
  try {
    const body = await clone.json();
    console.log('Response body:', body);
  } catch (error) {
    console.error('Error parsing response body:', error);
  }
}