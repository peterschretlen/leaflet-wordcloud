var webpack = require('webpack');
var path = require('path');

var BUILD_DIR = path.resolve(__dirname, 'src/public');
var APP_DIR = path.resolve(__dirname, 'src/app');

function webpackPlugins(env) {
  console.log(env);
  const plugins = [
    new webpack.DefinePlugin({
      '__CLIENTID__' : JSON.stringify(env.clientid)
    })
  ];

  return plugins;
}

module.exports = function makeConfig(cfgEnv) {

  return {
    entry: APP_DIR + '/index.js',
    output: {
      path: BUILD_DIR,
      filename: 'bundle.js'
    },
    plugins:  webpackPlugins(cfgEnv),
    devtool: 'source-map',
    module : {
      loaders : [
        {
          test : /\.js?/,
          include : APP_DIR,
          loader : 'babel-loader'
        }
      ]
    }
  };
};