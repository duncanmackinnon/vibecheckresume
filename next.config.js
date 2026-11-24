const { withWorkflow } = require('workflow/next');
/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode:true, output:'standalone', poweredByHeader:false, outputFileTracingRoot:__dirname,
  serverExternalPackages:['pg','pdfjs-dist'],
  outputFileTracingIncludes:{
    '/api/resumes':['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
    '/api/resumes/upload':['./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'],
  },
  experimental:{serverActions:{bodySizeLimit:'10mb'}},
  webpack(config,{isServer,webpack}) {
    if(isServer) {
      config.resolve.alias={...config.resolve.alias,canvas:false};
      config.plugins.push(new webpack.IgnorePlugin({resourceRegExp:/^canvas$/}));
    } else {
      config.resolve.alias={...config.resolve.alias,canvas:require.resolve('./lib/browser-canvas.js')};
      config.resolve.fallback={...config.resolve.fallback,buffer:require.resolve('buffer/'),fs:false,path:false,stream:false,crypto:false,os:false};
      config.plugins.push(new webpack.ProvidePlugin({Buffer:['buffer','Buffer']}));
    }
    return config;
  },
};
module.exports=withWorkflow(nextConfig);
