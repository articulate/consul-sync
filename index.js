const gimme = require('@articulate/gimme')
const Joi   = require('joi')

const { backoff, convergeP, mapP, validate } = require('@articulate/funky')

const {
  always, compose, composeP, curry, curryN, equals, identity, filter,
  mergeAll, map, partial, path, prop, replace, tap, unless, zipObj
} = require('ramda')

const schema = Joi.object({
  prefixes: Joi.array().items(Joi.string()).single().default([]),
  uri:      Joi.string().default(process.env.CONSUL_HTTP_ADDR)
})

const compact = filter(identity)

const mellow = compose(curryN(2), backoff(250, 4))

const check = curry((opts, index) => {
  const { prefixes, uri } = opts
  console.log('check:', index)
  return Promise.race(map(wait({ index, uri }), prefixes))
    .then(unless(equals(index), sync(opts)))
    .then(check(opts))
})

const decode = val =>
  new Buffer(val, 'base64').toString('utf8')

const getEnv = mellow(({ uri }, prefix) =>
  gimme({
    data: { keys: true, recurse: true },
    url: url(uri, prefix)
  }).then(prop('body'))
    .then(map(replace(prefix, '')))
    .then(compact)
    .then(convergeP(zipObj, [
      identity,
      mapP(getVal({ prefix, uri }))
    ]))
)

const getVal = mellow(({ prefix, uri }, key) =>
  gimme({ url: url(uri, prefix, key) })
    .then(path([ 'body', 0, 'Value' ]))
    .then(decode)
)

const setEnv = env => {
  Object.assign(process.env, env)
}

const start = opts =>
  check(opts, null)
    .catch(console.error)
    .then(partial(start, [ opts ]))

const sync = curry((opts, index) =>
  mapP(getEnv(opts), opts.prefixes)
    .then(mergeAll)
    .then(setEnv)
    .then(always(index))
)

const url = (uri, prefix, key='') =>
  `${uri}/v1/kv/${prefix}${key}`

const wait = mellow(({ index, uri }, prefix) =>
  gimme({
    data: { index, recurse: true },
    url: url(uri, prefix)
  }).then(tap(console.log))
    .then(path(['headers', 'x-consul-index']))
)

module.exports = composeP(start, validate(schema))
