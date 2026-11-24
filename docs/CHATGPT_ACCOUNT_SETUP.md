# ChatGPT subscription linking removed

The hosted product no longer implements ChatGPT plan linking. Its public local/open-source integration cannot be assumed available to a hosted website without access approval. OAuth endpoints, stored-token client code, connection card and environment variables have been removed.

See [the hosted product plan](HOSTED_PRODUCT_PLAN.md) for official sources and alternatives. Website AI uses server-owned API credentials; website sign-in uses Auth0.

The separate, optional tracker MCP connection remains supported; see [MCP setup](CHATGPT_MCP_SETUP.md). It does not power website inference.
