import path from "path";
import fs from "fs";
import { promisify } from "util";
import webpack, { Configuration } from "webpack";
import CopyPlugin from "copy-webpack-plugin";
import Dotenv from "dotenv-webpack";
import ZipPlugin from "zip-webpack-plugin";
import WebpackBar from "webpackbar";
import ExtReloader from "webpack-ext-reloader";
import TerserPlugin from "terser-webpack-plugin";
import { BundleAnalyzerPlugin } from "webpack-bundle-analyzer";

import { Environment, isDevEnv } from "./env";

const readFileAsync = promisify(fs.readFile);
const rootDir = path.resolve(__dirname, "../");
const resolvePath = (...segments: string[]) =>
  path.resolve(rootDir, ...segments);

export const getConfig = async ({
  env,
  shouldBuild,
}: {
  env: Environment;
  shouldBuild: "none" | "prod" | "analyze";
}): Promise<Configuration> => {
  const isDevelopment = isDevEnv(env);
  const manifestFilePath = resolvePath("./manifest.json");
  const maniFestFileRawContent = await readFileAsync(manifestFilePath, "utf8");
  const version = JSON.parse(maniFestFileRawContent).version;

  const buildDirPath = resolvePath("./build");

  const packageDirPath =
    shouldBuild === "prod" ? resolvePath("./packages") : null;

  return {
    mode: env,
    node: false,
    optimization: {
      minimize: !isDevelopment,
      minimizer: [
        new TerserPlugin({
          extractComments: false,
          terserOptions: {
            output: {
              ascii_only: true,
            },
          },
        }),
      ],
      concatenateModules: shouldBuild !== "analyze",
    },
    performance: false,
    devtool: isDevelopment ? "inline-source-map" : undefined,
    entry: {
      main: resolvePath("./app/main.tsx"),
      background: resolvePath("./app/background.ts"),
      page: resolvePath("./app/page.ts"),
    },
    output: {
      path: buildDirPath,
      filename: "[name].js",
      chunkFilename: "[id].chunk.js",
    },
    resolve: {
      extensions: [".js", ".json", ".mjs", ".jsx", ".ts", ".tsx"],
      alias: {
        "@extension": path.resolve("./app/src"),
        redis: false,
        // stream: "stream-browserify",
        // next: false,
      },
      fallback: {
        url: false,
        stream: require.resolve("stream-browserify"),
        buffer: require.resolve("buffer/"),
        path: false,
        fs: false,
        crypto: false,
        events: false,
        net: false,
        redis: false,
      },
    },
    module: {
      rules: [
        {
          test: /\.css$/,
          use: [
            "style-loader",
            "css-loader",
            {
              loader: "postcss-loader",
              options: {
                postcssOptions: {
                  config: path.resolve(__dirname, "postcss.config.js"),
                },
              },
            },
          ],
        },
        {
          test: /\.tsx?$/,
          use: {
            loader: "ts-loader",
            options: {
              configFile: resolvePath("./tsconfig.json"),
            },
          },
          exclude: /node_modules/,
        },
      ],
    },
    plugins: [
      new WebpackBar({
        name: `DustExt [${env}]`,
        color: "#3B82F6",
      }),
      new webpack.EnvironmentPlugin({
        VERSION: version,
      }),
      new webpack.ProvidePlugin({
        Buffer: ["buffer", "Buffer"],
      }),
      new Dotenv({
        path: isDevelopment ? "./.env.development" : "./.env.production",
      }),
      new CopyPlugin({
        patterns: [
          {
            from: manifestFilePath,
            to: path.join(buildDirPath, "manifest.json"),
          },
          {
            from: resolvePath("./app/main.html"),
            to: path.join(buildDirPath, "main.html"),
          },
          {
            context: resolvePath("./app/images"),
            from: "**/*.png",
            to: path.resolve(buildDirPath, "images"),
          },
        ],
      }),
      new webpack.BannerPlugin({
        banner: "\ufeff", // UTF-8 BOM
        raw: true,
      }),
      ...(shouldBuild === "analyze" ? [new BundleAnalyzerPlugin()] : []),
      packageDirPath
        ? new ZipPlugin({
            path: packageDirPath,
            filename: `Dust_Extension.v${version}.zip`,
          })
        : null,
      isDevelopment
        ? // @ts-ignore (it's working)
          new ExtReloader({
            port: 9090,
            reloadPage: true,
            entries: {
              contentScript: "main",
              background: "background",
            },
          })
        : null,
    ].filter(Boolean),
  };
};
