export const MUD_CONFIG = {
  servers: {
    discworld: { host: process.env.MUD_HOST || 'discworld.starturtle.net', port: 4242 },
    // easily add other MUDs
  },
  defaultServer: 'discworld',
  autoLogin: true
};

export function getServer(name = 'discworld') {
  return MUD_CONFIG.servers[name as keyof typeof MUD_CONFIG.servers];
}
