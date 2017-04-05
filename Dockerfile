FROM mhart/alpine-node:6

ADD src src

ADD package.json package.json

RUN npm install

EXPOSE 8000

CMD ["npm", "start"]
