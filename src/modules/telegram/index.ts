//#region imports
import * as TelegramBot from 'node-telegram-bot-api';
import { IWord, IChat } from '../firebase/types';
import { getRoute, setRoute, Routes, Route } from '../../misc/router';
import { Listener, ListenerCallback, ContentType } from './types';
import config from '../../misc/configuration-manager';
import * as net from 'net';
import { ok, correction } from '../feedback';
import { typeFetcher } from './type-fetcher';
import { shuffle, chunkArray } from '../../misc/common';
import { messaging } from 'firebase-admin';
//#endregion

let bot: TelegramBot;
let currentWord: number = 0;
let words: IWord[];

const events: {cmd: string | RegExp, callback: (message: TelegramBot.Message) => void}[] = [
  {
    cmd: /\/add/,
    callback: (message: TelegramBot.Message) => onAdd(message)
  },
  {
    cmd: /\/start/,
    callback: (message: TelegramBot.Message) => onStart(message)
  },
  {
    cmd: /\/test/,
    callback: (message: TelegramBot.Message) => onTest(message)
  },
  {
    cmd: /\/list/,
    callback: (message: TelegramBot.Message) => onList(message)
  },
  {
    cmd: 'message',
    callback: (message: TelegramBot.Message) => onText(message)
  }
];

const listeners: Listener = {};

const ask = (delay: number, message: TelegramBot.Message) => {
  if (!words || !words.length) {

  }
  if (currentWord >= words.length) {
    sendMessage(message, 'You finished the test 🎉');
    return;
  }
  setTimeout(() => {
    sendMessage(message, `What is "${words[currentWord].key}"?`);
  });
}

const onText = (message: TelegramBot.Message) => {
  // if it's command
  if(/\//.exec(message.text)) {
    return;
  }
  switch (getRoute()) {
    case Routes.ADD:
      fireListeners(message);
      break;
    case Routes.TEST:
      checkWord(message).then(() => {
        ask(1000, message);
      });
      break;
  }
}

const validateWords = (message: TelegramBot.Message) => {
  if (!words || !words.length) {
    sendMessage(message, 'Sorry, something went wrong 😓 please /start again');
    return false;
  }
  return true;
}

const checkWord = (message: TelegramBot.Message) => {
  if (message.text == words[currentWord].translate) {
    currentWord++;
    return ok(message);
  } else {
    return correction(message);
  }
}

const onAdd = (message: TelegramBot.Message) => {
  setRoute(Routes.ADD);
  sendMessage(message, 'Please add a word like: word,translate');
}

const onTest = (message: TelegramBot.Message) => {
  if (validateWords(message)) {
    setRoute(Routes.TEST);
    currentWord = 0;
    sendMessage(message, `Lets play 😄`).then(() => {
      ask(1000, message);
    });
  }
}

const onStart = (message: TelegramBot.Message) => {
  console.log('---onStart');
  setRoute(Routes.START);
  const { first_name, last_name } = message.chat;
  sendMessage(message,
    `Hi ${first_name} ${last_name}! I'm the dictation bot😄\n
To start the test use /test
To add a word to the list use /add
To see\\delete a word from the list use /list`
    );
  fireListeners(message);
}

const onList = (message: TelegramBot.Message) => {
  if (validateWords(message)) {
    const buttons: TelegramBot.InlineKeyboardButton[] = words.map(w => ({
      text: w.key,
      callback_data: w.key
    }));
    sendMessageWithButtons(message, 'here is your words\n click on a word to see your options', buttons);
  }
}

const fireListeners = (message: TelegramBot.Message) => {
  const routeListeners = listeners[getRoute()];
  if (routeListeners) {
    routeListeners.forEach(l => l(message));
  }
}

export const init = () => {
  const options: any = {};
  if (config.prod) {
    options.webHook = {
      port: config.PORT
    };
  } else {
    options.polling = true;
  }

  bot = new TelegramBot(config.botToken, options);
  console.log('bot started');

  if (config.prod) {
    bot.setWebHook(`${config.appURL}bot${config.botToken}`);
    console.log('setWebHook');
  }

  events.forEach(event => {
    if (event.cmd instanceof RegExp) {
      bot.onText(event.cmd, event.callback);
    } else {
      bot.on(event.cmd, event.callback);
    }
  });


  bot.on('polling_error', (error) => {
    console.log(error);  // => 'EFATAL'
  });
}

export const start = (_words_: IWord[], message: TelegramBot.Message) => {
  words = shuffle(_words_);
}

export const register = (route: Route, callback: ListenerCallback) => {
  if (!listeners[route]) {
    listeners[route] = [];
  }

  (<ListenerCallback[]>listeners[route]).push(callback);
}

export const sendMessage = (message: TelegramBot.Message, content: string, options?: TelegramBot.SendMessageOptions) => {
  const { id } = message.chat;
  const method = typeFetcher.getMethod(bot, content);

  return method.call(bot, id, content, options);
}

export const sendMessageWithButtons = (message: TelegramBot.Message, content: string, buttons: TelegramBot.InlineKeyboardButton[], chunkSize = 2) => {
  const inline_keyboard = chunkArray(buttons, chunkSize);
  return sendMessage(message, content, {
    reply_markup: {
      inline_keyboard
    }
  });
}