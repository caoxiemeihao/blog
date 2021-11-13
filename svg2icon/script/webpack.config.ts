import { join } from 'path'
import { Configuration } from 'webpack'

export default function (env: typeof process.env.NODE_ENV = 'production'): Configuration {
  const isdev = env === 'development'

  return {
    mode: isdev ? 'development' : 'production',
    devtool: isdev ? 'cheap-module-source-map' : 'source-map',
    entry: join(__dirname, '../src/index.tsx'),
    output: {
      path: join(__dirname, '../dist'),
      filename: '[name]-[contentHash:9].js',
    },
    module: {
      rules: [
        {
          test: /\.(ts|tsx|js|jsx)$/,
          loader: 'babel-loader',
          options: {
            presets: [["react-app", { "flow": false, "typescript": true }]],
          },
        },
        {
          test: /\.(jpg|png|gif|svg)$/,
          loader: 'file-loader',
        },
      ],
    },
  }
}
