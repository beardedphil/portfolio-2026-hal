import '@testing-library/jest-dom'

// Force React and React DOM to use the same instance
// This fixes the "Invalid hook call" error when running tests from root
import React from 'react'
import ReactDOM from 'react-dom'

// Ensure React DOM uses the same React instance
if (typeof window !== 'undefined' && window.React === undefined) {
  ;(window as any).React = React
}
