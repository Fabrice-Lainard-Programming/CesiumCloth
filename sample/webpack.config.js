/*
 * Cesium Cloth Primitive 
 * Written by Fabrice Lainard, 2022/2023
 * https://www.flprogramming.fr
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *
 */

// The path to the CesiumJS source code
const cesiumSource = 'node_modules/cesium/Source';
const cesiumWorkers = '../Build/Cesium/Workers';
const CopyWebpackPlugin = require('copy-webpack-plugin');
const path = require('path');
const webpack = require('webpack');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const process = require('process');
const pathBuilder = (subpath) => path.join(process.cwd(), subpath);

module.exports = {
    context: __dirname,
    entry: {
        app: './src/index.tsx'
    },
    output: {
        filename: 'bundle.js',
        path: path.resolve(__dirname, 'dist'),
        sourceMapFilename: "bundle.js.map",
        sourcePrefix: '',
        
    },
    resolve: {
        fallback: { "https": false, "zlib": false, "http": false, "url": false },
        extensions: ['*', '.js', '.jsx', '.ts', '.tsx'],
        mainFiles: ['index', 'Cesium'],
        alias: {
            // CesiumJS module name
            cesiumSource: pathBuilder('node_modules/cesium/Source'),
             
            
          },
    },
    module: {
        rules: [
            {
                test: /\.js$/,
                enforce: 'pre',
                use: ['source-map-loader'],
              },
            {
                test: /\.(js|jsx)$/,
                exclude: /node_modules/,
                use: ['babel-loader'],
            },
            {
                test: /\.css$/,
                use: ['style-loader', 'css-loader']
            }, {
                test: /\.(gif|jpg|jpeg|svg|xml|json|svg)$/,
                use: ['url-loader']
            },{
                test: /\.(png)$/,
                use: ['url-loader']
            },
            { test: /\.tsx?$/, loader: 'ts-loader' },
        ]
    },  
    plugins: [
        new HtmlWebpackPlugin({
            template: 'src/index.html'
        }),
        new webpack.HotModuleReplacementPlugin(),
        // Copy Cesium Assets, Widgets, and Workers to a static directory
        new CopyWebpackPlugin({
            patterns: [
                { from: path.join(cesiumSource, cesiumWorkers), to: 'Workers' },
                { from: path.join(cesiumSource, 'Assets'), to: 'Assets' },
                { from: path.join(cesiumSource, 'Widgets'), to: 'Widgets' },
                { from: './src/textures', to: 'textures' }
                
            ]
        }),
        new webpack.DefinePlugin({
            // Define relative base path in cesium for loading assets
            CESIUM_BASE_URL: JSON.stringify('')
        })
    ],
    devServer: {
        static: path.resolve(__dirname, './dist'),
        port: 9001,
        headers: {
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, PATCH, OPTIONS",
            "Access-Control-Allow-Headers": "X-Requested-With, content-type, Authorization",
            "Cross-Origin-Opener-Policy": "same-origin",
            "Cross-Origin-Embedder-Policy": "require-corp"
          }
    },
    mode: 'development',
    //devtool: 'eval',
    devtool: 'inline-source-map',
    ignoreWarnings: [/Failed to parse source map/],
};