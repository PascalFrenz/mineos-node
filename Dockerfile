FROM ubuntu:focal
LABEL MAINTAINER='William Dizon <wdchromium@gmail.com>'

#update and accept all prompts
ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y \
  supervisor \
  rdiff-backup \
  screen \
  rsync \
  git \
  curl \
  rlwrap \
  openjdk-16-jre-headless \
  openjdk-8-jre-headless \
  ca-certificates-java \
  build-essential \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

#install node from nodesource following instructions: https://github.com/nodesource/distributions#debinstall
RUN curl -fsSL https://deb.nodesource.com/setup_14.x | bash - \
  && apt-get install -y nodejs \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

RUN npm install -g ts-node typescript

#download mineos from github
RUN mkdir -p /usr/games/minecraft
COPY . /usr/games/minecraft
RUN cd /usr/games/minecraft; \
    cp mineos.conf /etc/mineos.conf; \
    chmod +x ./src/webui.ts ./src/mineos_console.ts ./src/service.ts; \

#build npm deps and clean up apt for image minimalization
RUN cd /usr/games/minecraft \
  && npm install \
  && apt-get autoremove -y \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

#build UI
RUN cd /usr/games/minecraft/mineos-app; \
  npm install; \
  npm run build
#configure and run supervisor
RUN cp /usr/games/minecraft/init/supervisor_conf /etc/supervisor/conf.d/mineos.conf
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]

#entrypoint allowing for setting of mc password
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

EXPOSE 8443 25565-25570
VOLUME /var/games/minecraft

ENV USER_PASSWORD=random_see_log USER_NAME=mc USER_UID=1000 USE_HTTPS=true SERVER_PORT=8443
