/** Jest config for traffic-dashboard.
 *
 *  Uses babel-jest directly rather than next/jest because the Next.js 16 jest
 *  wrapper currently has compatibility issues with Jest 30 + Node 24.
 *  Run with Node ≤ 22 locally for best results, or rely on CI (Node 20).
 */

/** @type {import('jest').Config} */
module.exports = {
  testEnvironment: 'jsdom',
  setupFiles: ['<rootDir>/jest.setup.js'],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '\\.(css|less|scss)$': '<rootDir>/__mocks__/styleMock.js',
  },
  transform: {
    '^.+\\.(ts|tsx|js|jsx)$': ['babel-jest', {
      presets: [
        ['@babel/preset-env', { targets: { node: 'current' } }],
        ['@babel/preset-react', { runtime: 'automatic' }],
        '@babel/preset-typescript',
      ],
    }],
  },
  testPathIgnorePatterns: ['/node_modules/', '/.next/'],
};
