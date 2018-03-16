'use strict'

const BFX = require('bitfinex-api-node')
const SocksProxyAgent = require('socks-proxy-agent')

const { WS_URL, REST_URL, SOCKS_PROXY_URL } = process.env
const agent = SOCKS_PROXY_URL ? new SocksProxyAgent(SOCKS_PROXY_URL) : null

const getBFX = (apiKey, apiSecret) => {
  return new BFX({
    apiKey,
    apiSecret,

    ws: {
      url: WS_URL,
      agent
    },

    rest: {
      url: REST_URL,
      agent
    }
  })
}

module.exports = getBFX
