'use strict'

module.exports = () => ({
  id: 'open_ws',
  label: 'open ws2 connections (maker, taker)',
  exec: ({ wsT, wsM }) => {
    return wsT.open().then(() => wsM.open())
  }
})
