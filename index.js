const _ = require('highland')
const { basename } = require('path')
const { backoff, validate } = require('@articulate/funky')
const axios = require('axios')
const debug = require('debug')('consul-sync')
const Joi = require('joi')

const {
  assoc,
  composeP,
  map,
  path,
  reduce,
} = require('ramda')

const BASE_WAIT = 10
const CONSUL_WAIT = `${BASE_WAIT}m`
const AXIOS_TIMEOUT = BASE_WAIT * 60 * 1000 + 10000 // 10m + 10s

const schema = Joi.object({
  prefixes: [Joi.string(), Joi.object()],
  uri: Joi.string().uri({ scheme: [/https?/] }),
})

const buildUrl = (uri, prefix) => `${uri}/v1/kv/${prefix}`
const getIndex = path(['headers', 'x-consul-index'])

const parseEnv = (env, { Key, Value }) =>
  Value === null ? env : assoc(basename(Key), decode(Value), env)

const parseEnvs = reduce(parseEnv, {})
const decode = val => Buffer.from(val, 'base64').toString('utf8')

const setEnv = (env) => {
  Object.assign(process.env, env)
  debug(env)
}

const getNextIndex = (previousIndex, nextIndex) =>
  parseInt(previousIndex) > parseInt(nextIndex) ? 0 : nextIndex

const hasIndexIncreased = (previousIndex, nextIndex) =>
  parseInt(nextIndex) > parseInt(previousIndex)

const fetch = async (uri, prefix, index) => {
  const prefixUrl = buildUrl(uri, prefix)

  const response = await axios.get(prefixUrl, {
    params: {
      consistent: true,
      index,
      recurse: true,
      wait: CONSUL_WAIT,
    },
    timeout: AXIOS_TIMEOUT
  })

  const { data, request } = response

  return {
    requestUrl: `${uri}${request.path}`,
    data,
    previousIndex: index,
    nextIndex: getIndex(response)
  }
}

const fetchWithBackoff = backoff({ tries: 10 }, fetch)

const monitor = uri => ([namespace, prefix]) => {
  let index = 0

  return _(async (push, next) => {
    try {
      const {
        data,
        previousIndex,
        nextIndex,
        requestUrl,
      } = await fetchWithBackoff(uri, prefix, index)

      index = getNextIndex(previousIndex, nextIndex)

      if (hasIndexIncreased(previousIndex, nextIndex)) {
        console.info('Consul syncing, env changed recieved', JSON.stringify({
          index,
          prefix,
          requestUrl,
          requestIndex: previousIndex,
          responseIndex: nextIndex,
        }))

        const envVars = parseEnvs(data)
        push(null, { envVars, namespace })
      } else {
        console.info('Consul index out of sync, reset to 0', JSON.stringify({
          previousIndex,
          nextIndex
        }))
      }
    } catch (error) {
      console.error('Consul syncing error', JSON.stringify({
        error,
        info: { index }
      }))
      index = 0
    }

    next()
  })
}

const buildEnv = (namespace, envCache) => {
  const entries = Object.entries(envCache)
  const objectMap = entries.reduce((map, [key,value]) =>
    map.set(`${namespace}${key}`,value),
  new Map())
  return Object.fromEntries(objectMap.entries())
}

const updateEnv = ({ envVars, namespace }) => {
  setEnv(buildEnv(namespace, envVars))
}

const cleanNamespace = (entries) => entries.map(
  ([namespace, prefix]) =>
    [`${namespace?.toUpperCase().replaceAll('-', '_') ?? ''}${namespace ? '_' : ''}`, prefix]
)

const consulSync = ({ prefixes, uri }) => {
  const targets = typeof prefixes === 'string' ? [['', prefixes]] : Object.entries(prefixes)

  return _(map(monitor(uri), cleanNamespace(targets)))
    .merge()
    .each(updateEnv)
}

module.exports = composeP(consulSync, validate(schema))
