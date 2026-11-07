import next from "eslint-config-next";

const config = [...next, { ignores: ["src/generated/**", ".next/**"] }];
export default config;
