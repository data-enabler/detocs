import log4js from 'log4js';
const logger = log4js.getLogger('server/info');

import ws from 'ws';
import express from 'express';
import formidable from 'express-formidable';
import { Server, createServer } from 'http';
import cors from 'cors';

import ScoreboardAssistant from './output/scoreboard-assistant';
import Game, { nullGame } from '../../models/game';
import gameList from '../../models/games';
import LowerThird from '../../models/lower-third';
import * as People from '../../models/people';
import Person, { PersonUpdate } from '../../models/person';
import Scoreboard from '../../models/scoreboard';
import uuidv4 from '../../util/uuid';

export default function start(port: number): void {
  const output = new ScoreboardAssistant();
  logger.info('Initializing overlay info server');

  const app = express();
  // TODO: Security?
  app.use(cors());
  app.use(formidable());
  app.post('/scoreboard', (req, res) => {
    const uuid = uuidv4();
    logger.debug(`Scoreboard update ${uuid} received:\n`, req.fields);
    if (req.fields) {
      const scoreboard = parseScoreboard(req.fields);
      output.updateScoreboard(scoreboard);
      res.send({
        'updateId': uuid,
        'scoreboard': scoreboard,
      });
    } else {
      res.sendStatus(400);
    }
  });
  app.post('/lowerthird', (req, res) => {
    const uuid = uuidv4();
    logger.debug(`Lower third update ${uuid} received:\n`, req.fields);
    if (req.fields) {
      const lowerThird = parseLowerThird(req.fields);
      output.updateLowerThird(lowerThird);
      res.send({
        'updateId': uuid,
        'lowerThird': lowerThird,
      });
    } else {
      res.sendStatus(400);
    }
  });
  app.get('/people', (req, res) => {
    const query = req.query['q'];
    if (query == null || typeof query !== 'string' || !query.length) {
      res.sendStatus(400);
      return;
    }
    res.send(People.searchByHandle(query));
  });
  app.get('/people/:id(\\d+)', (req, res) => {
    const id = +req.params['id'];
    res.send(People.getById(id));
  });
  app.get('/games', (_, res) => {
    res.send(gameList);
  });

  const httpServer = createServer(app);
  const socketServer = new ws.Server({
    server: httpServer,
  });
  socketServer.on('connection', function connection(ws): void {
    // TODO: Send current info
    logger.info('Websocket connection received');
  });

  httpServer.listen(port, () => logger.info(`Listening on port ${port}`));
};

function parseScoreboard(fields: Record<string, any>): Scoreboard {
  const players = [];
  for (let i = 0; i < 2; i++) {
    const fieldPrefix = `players[${i}]`;
    const person = parsePerson(fields, fieldPrefix);

    const scoreStr: string | undefined = fields[`${fieldPrefix}[score]`] || 0;
    const score: number = (scoreStr && parseInt(scoreStr)) || 0;
    players.push({ person, score });
  }
  // TODO: Reload people from datastore?

  const game = parseGame(fields);
  return {
    players,
    game,
    match: fields['match'] as string,
  };
}

function parseLowerThird(fields: Record<string, any>): LowerThird {
  const commentators = [];
  for (let i = 0; i < 2; i++) {
    const fieldPrefix = `players[${i}]`;
    const person = parsePerson(fields, fieldPrefix);
    commentators.push({ person });
  }
  // TODO: Reload people from datastore?
  return {
    commentators,
    match: fields['match'] as string,
    game: fields['game'] as string,
  };
}

function parsePerson(fields: Record<string, unknown>, fieldPrefix: string): Person {
  const id: number | undefined = parseId(fields[`${fieldPrefix}[id]`]);
  const update: PersonUpdate = {
    id,
    handle: fields[`${fieldPrefix}[handle]`] as string,
  };
  const prefix = fields[`${fieldPrefix}[prefix]`] as string | null | undefined;
  if (prefix != null) {
    update.prefix = prefix;
  }
  const twitter = fields[`${fieldPrefix}[twitter]`] as string | null | undefined;
  if (twitter != null) {
    update.twitter = twitter;
  }
  return People.save(update);
}

function parseGame(fields: Record<string, unknown>): Game {
  const id = fields['game[id]'];
  if (!(typeof id === 'string')) {
    return nullGame;
  }
  const found = gameList.find(g => g.id === id);
  if (found) {
    return found;
  }
  const name = fields['game[name]'];
  if (!(typeof name === 'string')) {
    return nullGame;
  }
  return {
    id,
    name,
    shortNames: [],
    hashtags: [],
  };
}

function parseId(idStr: unknown): number | undefined {
  if (!(typeof idStr === 'string')) {
    return undefined;
  }
  return idStr ? parseInt(idStr) : undefined;
}
