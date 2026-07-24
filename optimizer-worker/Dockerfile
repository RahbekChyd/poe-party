FROM node:20-bookworm-slim

ARG POB_REF=f9f4f3b4ab6a3a37d2eb693265b5c73317ff42a6
ARG POB_SHA256=bf4c2171b54e3c2db578bcd0e576c1395abe80aad8068297e858074131e0eada

ENV POB_ROOT=/opt/pob
ENV POB_REF=${POB_REF}
ENV POB_RUNTIME_COMMAND=/app/pob/run-pob-runtime.sh
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl luajit \
  && rm -rf /var/lib/apt/lists/*

RUN mkdir -p /opt \
  && curl -fsSL "https://github.com/PathOfBuildingCommunity/PathOfBuilding/archive/${POB_REF}.tar.gz" -o /tmp/pob.tar.gz \
  && echo "${POB_SHA256}  /tmp/pob.tar.gz" | sha256sum -c - \
  && tar -xzf /tmp/pob.tar.gz -C /opt \
  && mv "/opt/PathOfBuilding-${POB_REF}" "${POB_ROOT}" \
  && for part0 in "${POB_ROOT}"/src/Data/TimelessJewelData/*.zip.part0; do \
       [ -e "${part0}" ] || continue; \
       zip_path="${part0%.part0}"; \
       cat "${zip_path}".part* > "${zip_path}"; \
     done \
  && rm /tmp/pob.tar.gz

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY pob ./pob

RUN chmod +x /app/pob/run-pob-runtime.sh

RUN groupadd --system --gid 10001 optimizer \
  && useradd --system --uid 10001 --gid optimizer --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin optimizer

EXPOSE 8788

STOPSIGNAL SIGTERM

USER optimizer:optimizer

CMD ["npm", "run", "start"]
