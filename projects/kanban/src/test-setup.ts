import '@testing-library/jest-dom'
// Ensure React is available globally before any component imports
import React from 'react'
import ReactDOM from 'react-dom'

// Make React available globally to ensure all modules use the same instance
if (typeof globalThis.React === 'undefined') {
  globalThis.React = React
}
if (typeof globalThis.ReactDOM === 'undefined') {
  globalThis.ReactDOM = ReactDOM
}
