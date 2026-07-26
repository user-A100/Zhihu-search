setTimeout(() => {
  if (document.documentElement.dataset.zhicangReady === "true") return;
  const message = document.getElementById("bootError");
  if (message) message.hidden = false;
}, 300);
