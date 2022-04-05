# API

```haskell
consulSync : { k: v } -> Promise Error ()
```

Accepts an object of options described below:

| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `prefixes` | `[String]` | `[]` | List of key prefixes to sync |
| `uri` | `String` | | Consul base uri (must include protocol) |

Returns a `Promise` that rejects with an error if the options are invalid.

Will begin synchronizing your `process.env` with [KV pairs](https://www.consul.io/api/kv.html) stored in [Consul](https://www.consul.io/).  It long-polls for changes, and when notified it will query and merge all of the env vars stored under the given `prefixes` before assigning them onto the `process.env`.

The merge order for env vars is RTL, such that, in the example below, app-specific vars stored under the prefix `services/my-app/env_vars` will override global vars stored under the prefix `global/env_vars`.

```js
if (process.env.NODE_ENV === 'production') {
  require('@articulate/consul-sync')({
    prefixes: [
      `global/env_vars`,
      `services/my-app/env_vars`
    ],
    uri: `https://${process.env.CONSUL_ADDR}`
  })
}
```

When something goes wrong, such as when Consul is unreachable, a JSON-formatted error is logged to the console, and then `consul-sync` waits five seconds before retrying indefinitely.
