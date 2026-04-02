import type {NextConfig} from 'next';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  eslint: {
    ignoreDuringBuilds: true,
  },
  typescript: {
    ignoreBuildErrors: false,
  },
  // Allow access to remote image placeholder.
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'picsum.photos',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'lh3.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'm.media-amazon.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images-na.ssl-images-amazon.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'cdn.awsli.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'assets-pontodofogao.egondola.app',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'superkoch.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'superkoch.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'i.pinimg.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'i.pinimg.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'http2.mlstatic.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: 'http2.mlstatic.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: 'images.unsplash.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.gstatic.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '**.gstatic.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.googleusercontent.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.mlstatic.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '**.mlstatic.com',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.tcdn.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '**.tcdn.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.kabum.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.casasbahia.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.extra-imagens.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.pontofrio-imagens.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.mlcdn.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.b2w.io',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.magazineluiza.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.americanas.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.submarino.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.shoptime.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.fbitsstatic.net',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '**.fbitsstatic.net',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.vteximg.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '**.vteximg.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'https',
        hostname: '**.shoppub.com.br',
        port: '',
        pathname: '/**',
      },
      {
        protocol: 'http',
        hostname: '**.shoppub.com.br',
        port: '',
        pathname: '/**',
      },
    ],
  },
  output: 'standalone',
  transpilePackages: ['motion'],
  webpack: (config, {dev}) => {
    // HMR is disabled in AI Studio via DISABLE_HMR env var.
    // Do not modifyâfile watching is disabled to prevent flickering during agent edits.
    if (dev && process.env.DISABLE_HMR === 'true') {
      config.watchOptions = {
        ignored: /.*/,
      };
    }
    return config;
  },
};

export default nextConfig;
