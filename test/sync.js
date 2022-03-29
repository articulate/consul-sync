const chai = require('chai')
const spies = require('chai-spies')

chai.use(spies)

const { expect } = chai
const consul = require('./consul')

describe('consul-sync', () => {
  before(done => {
    chai.spy.on(console, 'info')

    require('..')({
      prefixes: [
        'globals/env_vars',
        'products/not-found',
        'services/my-app/env_vars'
      ],
      uri: consul.uri
    })

    setTimeout(done, 250)
  })

  after(() =>
    chai.spy.restore(console)
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
      consul.update('services/my-app/env_vars/COLOR', 'green')
      setTimeout(done, 250)
    })

    it('updates the process.env', () =>
      expect(process.env.COLOR).to.equal('green')
    )
  })

  describe('when the index is out of order', () => {
    beforeEach(function(done) {
      this.timeout(30000)
      setTimeout(consul.reset, 250)
      setTimeout(done, 5000)
    })

    it('logs that order is out of sync', () => {
      expect(console.info).to.have.been.called.with('Consul index out of sync, reset to 0')
    })
  })
})
