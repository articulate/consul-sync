const { expect } = require('chai')
const spy        = require('@articulate/spy')

const consul = require('./consul')

describe('consul-sync', () => {
  before(done => {
    console.error = spy()

    require('..')({
      prefixes: [
        'globals/env_vars',
        'apps/my-app/env_vars'
      ],
      retryAfter: 16
    })

    setTimeout(done, 250)
  })

  afterEach(() =>
    console.error.reset()
  )

  it('syncs the Consul KV store to the process.env', () => {
    expect(process.env.COLOR).to.equal('red')
    expect(process.env.SHA).to.equal('d2dd5de')
  })

  describe('when a new key is added to Consul', () => {
    beforeEach(done => {
      consul.update('globals/env_vars/FOO', 'bar')
      setTimeout(done, 250)
    })

    it('updates the process.env', () =>
      expect(process.env.FOO).to.equal('bar')
    )
  })

  describe('when a key is updated in Consul', () => {
    beforeEach(done => {
      consul.update('apps/my-app/env_vars/COLOR', 'green')
      setTimeout(done, 250)
    })

    it('updates the process.env', () =>
      expect(process.env.COLOR).to.equal('green')
    )
  })

  describe('when the connection to Consul is lost', () => {
    beforeEach(function(done) {
      this.timeout(30000)
      consul.disconnect()
      setTimeout(() => {
        consul.connect()
        setTimeout(done, 5000)
      }, 5000)
    })

    it('logs an error before retrying', () =>
      expect(console.error.calls.length).to.be.above(0)
    )
  })
})
