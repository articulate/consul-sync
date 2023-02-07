# API

```haskell
consulSync : { k: v } -> Promise : ([key, defaultValue]) -> string | object
```

Accepts an object of options described below:

| Name | Type | Default | Description |
| ---- | ---- | ------- | ----------- |
| `prefixes` | `String\|[String]\|Object` | `[]` | key prefixes to sync |
| `uri` | `String` | | Consul base uri (must include protocol) |

Returns a `Promise` that will provide a getter function to expose config or rejects with an error if the options are invalid. The getter function can be provided with an optional key and defaultValue. If no key is provided the current cache is returned.

Will begin to synchronize a local cache of variables with [KV pairs](https://www.consul.io/api/kv.html) stored in [Consul](https://www.consul.io/).  It long-polls for changes, and when notified it will query and merge all of the env vars stored under the given `prefixes` before caching them.

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

Other examples of config are:

### Single prefix
```js
if (process.env.NODE_ENV === 'production') {
  require('@articulate/consul-sync')({
    prefixes: `global/env_vars`,
    uri: `https://${process.env.CONSUL_ADDR}`
  })
}
```

### Namespaced prefix
  Variables synchronized using namespaces will prefix the keys with a namespace. In the example below `COLOR` from `global/env_vars` will be `COLOR` but from `services/my-app/env_vars` it will be `ANOTHER_COLOR`.

```js
if (process.env.NODE_ENV === 'production') {
  require('@articulate/consul-sync')({
    prefixes: {
      ``: [`global/env_vars`, `services/my-app/env_vars`],
      `another`: `services/my-app/env_vars`,
    },
    uri: `https://${process.env.CONSUL_ADDR}`
  })
}
```

When something goes wrong, such as when Consul is unreachable, a JSON-formatted error is logged to the console, and then `consul-sync` waits five seconds before retrying indefinitely.
