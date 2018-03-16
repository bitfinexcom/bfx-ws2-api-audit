'use strict'

module.exports = () => ({
  id: 'auth_ws',
  label: 'authenticate ws2 connections (maker, taker)',
  exec: ({ wsT, wsM }) => {
    return wsT.auth().then(() => wsM.auth())
  }
})
