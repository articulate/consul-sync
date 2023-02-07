const _ = require('highland')
const { basename } = require('path')
const { backoff, validate } = require('@articulate/funky')
const axios = require('axios')
const Joi = require('joi')
const R = require('ramda')


const BASE_WAIT = 10
const CONSUL_WAIT = `${BASE_WAIT}m`
const AXIOS_TIMEOUT = BASE_WAIT * 60 * 1000 + 10000 // 10m + 10s

const schema = Joi.object({
  namespace: Joi.string().allow(''),
  prefixes: Joi.array().single().items(Joi.string()).default([]),
  uri: Joi.string().uri({ scheme: [ /https?/ ] }),
})

const buildUrl = (uri, prefix) => `${uri}/v1/kv/${prefix}`
const getIndex = R.path([ 'headers', 'x-consul-index' ])

const parseEnv = (env, { Key, Value }) =>
  Value === null ? env : R.assoc(basename(Key), decode(Value), env)

const parseEnvs = R.reduce(parseEnv, {})
const decode = val => Buffer.from(val, 'base64').toString('utf8')

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

const monitor = uri => prefix => {
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
        push(null, { envVars, prefix })
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

const orderReducer = obj => (acc, key) => {
  if (!obj[key]) {
    return acc
  }

  return R.append(obj[key], acc)
}

const orderVals = (orderedKeys, obj) =>
  R.reduce(orderReducer(obj), [], orderedKeys)

const initializeEnvsCache = () => {
  const prefixedEnvs = {}

  return (prefix, env) => {
    prefixedEnvs[prefix] = env
    return prefixedEnvs
  }
}

const buildEnv = ({
  namespace,
  prefixes: orderedPrefixes,
  envCache,
}) => Object.fromEntries(
  Object.entries(
    R.mergeAll(orderVals(orderedPrefixes, envCache))
  ).map(([key, value]) => [`${namespace}${key}`, value])
)

const updateEnv = ({prefixes, namespace}) => {
  const updateEnvCache = initializeEnvsCache()

  return ({ prefix, envVars }) => {
    const envCache = updateEnvCache(prefix, envVars)
    return buildEnv({namespace, prefixes, envCache})
  }
}

const consulSync = ({ namespace, prefixes, uri }) =>
  _(R.map(monitor(uri), prefixes))
    .merge()
    .map(updateEnv({prefixes, namespace}))

module.exports = R.composeP(consulSync, validate(schema))