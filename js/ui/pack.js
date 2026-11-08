// When the game is opened by double click, the browser refuses to read picture and sound files for the stage.
// The same art is then taken from small scripts in assets/pack, loaded on demand.
const ForgePack = (() => {
  const offline = location.protocol === "file:" || /[?&]offline=1/.test(location.search);
  const loading = {};
  function load(name) {
    if (!loading[name]) {
      loading[name] = new Promise((resolve) => {
        const script = document.createElement("script");
        script.src = `assets/pack/${name}.js`;
        script.onload = () => resolve(true);
        script.onerror = () => resolve(false);
        document.head.append(script);
      });
    }
    return loading[name];
  }
  // Fills a texture from the pack. Until then it draws nothing.
  async function fillTexture(texture, packName, key) {
    await load(packName);
    const url = window.FORGE_PACK?.[key];
    if (!url) return;
    const image = new Image();
    image.onload = () => { texture.image = image; texture.needsUpdate = true; };
    image.src = url;
  }
  return { offline, load, fillTexture };
})();
