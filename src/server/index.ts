import { RoomDO } from './room';

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    if (url.pathname === '/' || url.pathname === '/index.html') {
      return env.ASSETS.fetch(req);
    }

    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') {
        return new Response('Expected WebSocket', { status: 426 });
      }

      const room = url.searchParams.get('room');
      if (!room) return new Response('Missing ?room=', { status: 400 });

      const id = env.ROOM.idFromName(room);
      const stub = env.ROOM.get(id);
      return stub.fetch(req);
    }

    return new Response('Not found', { status: 404 });
  },
} satisfies ExportedHandler<Env>;

export { RoomDO };
