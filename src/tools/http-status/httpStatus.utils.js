/** Standard HTTP status codes with their reason phrases and short descriptions. */
export const HTTP_STATUS_CODES = [
  [100, 'Continue', 'The server has received the request headers and expects the request body.'],
  [101, 'Switching Protocols', 'The server is switching protocols as requested by the client.'],
  [102, 'Processing', 'The server has received and is processing the request, but has no response yet.'],
  [103, 'Early Hints', 'The server sends preliminary headers before the final response is ready.'],
  [200, 'OK', 'The request succeeded.'],
  [201, 'Created', 'The request succeeded and created a new resource.'],
  [202, 'Accepted', 'The request was accepted for processing but is not complete.'],
  [203, 'Non-Authoritative Information', 'The returned metadata comes from a transformed source.'],
  [204, 'No Content', 'The request succeeded and there is no content to return.'],
  [205, 'Reset Content', 'The client should reset the document view that sent the request.'],
  [206, 'Partial Content', 'The server is returning the requested portion of the resource.'],
  [207, 'Multi-Status', 'The response contains status information for multiple resources.'],
  [208, 'Already Reported', 'The members of a WebDAV binding have already been reported.'],
  [226, 'IM Used', 'The server has fulfilled a GET request using instance manipulations.'],
  [300, 'Multiple Choices', 'The request has more than one possible response.'],
  [301, 'Moved Permanently', 'The resource has permanently moved to the URL in the Location header.'],
  [302, 'Found', 'The resource is temporarily available at a different URL.'],
  [303, 'See Other', 'The response can be found at another URL using a GET request.'],
  [304, 'Not Modified', 'The cached response is still valid and can be reused.'],
  [305, 'Use Proxy', 'The resource must be accessed through the proxy in the Location header.'],
  [306, 'Switch Proxy', 'This code is no longer used and was reserved for a previous purpose.'],
  [307, 'Temporary Redirect', 'The resource is temporarily at another URL with the method unchanged.'],
  [308, 'Permanent Redirect', 'The resource permanently moved to another URL with the method unchanged.'],
  [400, 'Bad Request', 'The server cannot process the request because it is invalid.'],
  [401, 'Unauthorized', 'Authentication is required before the request can proceed.'],
  [402, 'Payment Required', 'The request requires payment and is reserved for future use.'],
  [403, 'Forbidden', 'The server understands the request but refuses to authorize it.'],
  [404, 'Not Found', 'The server cannot find the requested resource.'],
  [405, 'Method Not Allowed', 'The request method is not supported for the target resource.'],
  [406, 'Not Acceptable', 'The server cannot provide content matching the request headers.'],
  [407, 'Proxy Authentication Required', 'Authentication with a proxy is required before the request can proceed.'],
  [408, 'Request Timeout', 'The server timed out while waiting for the request.'],
  [409, 'Conflict', 'The request conflicts with the current state of the resource.'],
  [410, 'Gone', 'The requested resource is no longer available and has no forwarding address.'],
  [411, 'Length Required', 'The request must include a Content-Length header.'],
  [412, 'Precondition Failed', 'A precondition supplied in the request evaluated to false.'],
  [413, 'Content Too Large', 'The request content is larger than the server is willing to process.'],
  [414, 'URI Too Long', 'The request target is longer than the server is willing to interpret.'],
  [415, 'Unsupported Media Type', 'The request content format is not supported by the server.'],
  [416, 'Range Not Satisfiable', 'The requested range cannot be fulfilled for the selected resource.'],
  [417, 'Expectation Failed', 'The server cannot meet the expectation in the Expect request header.'],
  [418, "I'm a Teapot", 'The server refuses to brew coffee because it is a teapot.'],
  [421, 'Misdirected Request', 'The request was sent to a server that cannot produce a response.'],
  [422, 'Unprocessable Content', 'The request is well-formed but cannot be processed as instructed.'],
  [423, 'Locked', 'The target resource is locked.'],
  [424, 'Failed Dependency', 'The request failed because a previous operation failed.'],
  [425, 'Too Early', 'The server is unwilling to risk processing a request that might be replayed.'],
  [426, 'Upgrade Required', 'The server requires the client to switch to a different protocol.'],
  [428, 'Precondition Required', 'The server requires the request to be conditional.'],
  [429, 'Too Many Requests', 'The client has sent too many requests in a given time.'],
  [431, 'Request Header Fields Too Large', 'The request header fields are larger than the server will process.'],
  [451, 'Unavailable For Legal Reasons', 'The resource is unavailable because of a legal demand.'],
  [500, 'Internal Server Error', 'The server encountered an unexpected condition.'],
  [501, 'Not Implemented', 'The server does not support the functionality needed for the request.'],
  [502, 'Bad Gateway', 'The server received an invalid response from an upstream server.'],
  [503, 'Service Unavailable', 'The server is not ready to handle the request.'],
  [504, 'Gateway Timeout', 'The server did not receive a timely response from an upstream server.'],
  [505, 'HTTP Version Not Supported', 'The server does not support the HTTP version used in the request.'],
  [506, 'Variant Also Negotiates', 'The server has an internal configuration error in content negotiation.'],
  [507, 'Insufficient Storage', 'The server cannot store the representation needed to complete the request.'],
  [508, 'Loop Detected', 'The server detected an infinite loop while processing the request.'],
  [510, 'Not Extended', 'Further extensions to the request are required for the server to fulfill it.'],
  [511, 'Network Authentication Required', 'The client must authenticate to gain network access.'],
].map(([code, reason, description]) => ({ code, reason, description }));

/**
 * Returns status codes matching a code fragment, reason phrase, or description.
 * @param {string} query Search text.
 * @param {Array<{code: number, reason: string, description: string}>} statuses Statuses to search.
 * @returns {Array<{code: number, reason: string, description: string}>} Matching statuses.
 */
export function searchHttpStatuses(query, statuses = HTTP_STATUS_CODES) {
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return statuses;
  return statuses.filter(({ code, reason, description }) => (
    String(code).includes(normalizedQuery)
      || reason.toLowerCase().includes(normalizedQuery)
      || description.toLowerCase().includes(normalizedQuery)
  ));
}

/**
 * Returns status codes belonging to an HTTP status class.
 * @param {'all' | '1xx' | '2xx' | '3xx' | '4xx' | '5xx'} statusClass Status class filter.
 * @param {Array<{code: number, reason: string, description: string}>} statuses Statuses to filter.
 * @returns {Array<{code: number, reason: string, description: string}>} Matching statuses.
 */
export function filterHttpStatusesByClass(statusClass, statuses = HTTP_STATUS_CODES) {
  if (statusClass === 'all') return statuses;
  const classNumber = Number(statusClass.charAt(0));
  return statuses.filter(({ code }) => Math.floor(code / 100) === classNumber);
}

/**
 * Returns status codes matching both a search query and status class.
 * @param {string} query Search text.
 * @param {'all' | '1xx' | '2xx' | '3xx' | '4xx' | '5xx'} statusClass Status class filter.
 * @returns {Array<{code: number, reason: string, description: string}>} Matching statuses.
 */
export function getFilteredHttpStatuses(query, statusClass) {
  return searchHttpStatuses(query, filterHttpStatusesByClass(statusClass));
}
