# PoB 2.68 uses compound assignment, unavailable in Debian's 2022 LuaJIT.
FROM node:20-bookworm-slim AS luajit-build
ARG LUAJIT_REF=63c8f1a9b479ba5518cf6a170ff7729178bc3cfd
ARG LUAJIT_SHA256=8cad76f444b76001b7123dc626c5d0bfc24f1f790333737443345f7e6b41bb5f
RUN apt-get update \
  && apt-get install -y --no-install-recommends build-essential curl ca-certificates \
  && curl -fsSL "https://github.com/LuaJIT/LuaJIT/archive/${LUAJIT_REF}.tar.gz" -o /tmp/luajit.tar.gz \
  && echo "${LUAJIT_SHA256}  /tmp/luajit.tar.gz" | sha256sum -c - \
  && tar -xzf /tmp/luajit.tar.gz -C /tmp \
  && make -C "/tmp/LuaJIT-${LUAJIT_REF}" -j2 BUILDMODE=static PREFIX=/opt/luajit \
  && make -C "/tmp/LuaJIT-${LUAJIT_REF}" install BUILDMODE=static PREFIX=/opt/luajit

FROM node:20-bookworm-slim

ARG POB_REF=a41fec6c20f822a658ae5df1273e8c69d5969bac
ARG POB_SHA256=c88726aae59808b6cc664cb2981d91a0c71a57af5221b4d6ae0624a4a4229ddc

COPY --from=luajit-build /opt/luajit /opt/luajit
ENV PATH="/opt/luajit/bin:${PATH}"
ENV POB_ROOT=/opt/pob
ENV POB_REF=${POB_REF}
ENV POB_RUNTIME_COMMAND=/app/pob/run-pob-runtime.sh
ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates curl \
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
  && find "${POB_ROOT}/src" "${POB_ROOT}/runtime/lua" -name '*.lua' -exec sed -i '1{/^#@$/d;}' {} + \
  && rm /tmp/pob.tar.gz

# SimpleGraphic launcher directives are not Lua source (e.g. #@ SimpleGraphic).
RUN find "${POB_ROOT}/src" -name '*.lua' -exec sed -i '1{/^#@/d;}' {} +

WORKDIR /app

COPY package.json ./
COPY src ./src
COPY pob ./pob

RUN chmod +x /app/pob/run-pob-runtime.sh \
  && luajit -b /app/pob/run-analysis.lua /tmp/pob-harness.luac \
  && rm /tmp/pob-harness.luac

RUN groupadd --system --gid 10001 optimizer \
  && useradd --system --uid 10001 --gid optimizer --no-create-home --home-dir /nonexistent --shell /usr/sbin/nologin optimizer

EXPOSE 8788

STOPSIGNAL SIGTERM

USER optimizer:optimizer

CMD ["npm", "run", "start"]
