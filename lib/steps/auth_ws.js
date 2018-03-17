'use strict'

module.exports = () => ({
  id: 'auth_ws',
  label: 'authenticate ws2 connections',
  actors: ['maker', 'taker'],
  exec: ({ wsT, wsM }) => {
    return wsT.auth().then(() => wsM.auth())
  }
})
