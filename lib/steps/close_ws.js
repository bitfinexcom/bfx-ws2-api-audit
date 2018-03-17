'use strict'

module.exports = () => ({
  id: 'close_ws',
  label: 'close ws2 connections',
  actors: ['maker', 'taker'],
  exec: ({ wsT, wsM }) => {
    return wsT.close().then(() => wsM.close())
  }
})
