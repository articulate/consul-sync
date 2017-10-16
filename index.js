const { basename } = require('path')
const debug        = require('debug')('consul-sync')
const gimme        = require('@articulate/gimme')
const Joi          = require('joi')

const { backoff, mapP, validate } = require('@articulate/funky')

const {
  always, assoc, compose, composeP, curry, curryN, equals,
  mergeAll, map, partial, path, prop, reduce, replace, unless
} = require('ramda')

const schema = Joi.object({
  prefixes: Joi.array().single().items(Joi.string()).default([]),
  uri:      Joi.string().default(process.env.CONSUL_HTTP_ADDR)
})

const mellow = compose(curryN(2), backoff(250, 4))

const check = curry((opts, index) => {
  const { prefixes, uri } = opts
  return Promise.race(map(wait({ index, uri }), prefixes))
    .then(unless(equals(index), sync(opts)))
    .then(check(opts))
})

const decode = val =>
  new Buffer(val, 'base64').toString('utf8')

const getEnv = mellow(({ uri }, prefix) =>
  gimme({
    data: { consistent: true, recurse: true },
    url: url(uri, prefix)
  }).then(prop('body'))
    .then(reduce(parseEnv, {}))
)

const parseEnv = (env, { Key, Value }) =>
  Value === null ? env : assoc(basename(Key), decode(Value), env)

const setEnv = env => {
  Object.assign(process.env, env)
  debug(process.env)
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
    data: { consistent: true, index, recurse: true },
    url: url(uri, prefix)
  }).then(path(['headers', 'x-consul-index']))
)

module.exports = composeP(start, validate(schema))
