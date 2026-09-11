(function () {
  var script = document.currentScript;
  var api = script.getAttribute("data-api");
  var post = script.getAttribute("data-post");
  var root = document.getElementById("comments");
  if (!api || !post || !root) return;

  var listEl = root.querySelector(".comment-list");
  var form = root.querySelector(".comment-form");
  var statusEl = root.querySelector(".comment-status");

  function escapeHtml(s) {
    return String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  }

  function renderComments(comments) {
    if (!comments.length) {
      listEl.innerHTML = "<p class=\"comment-empty\">No comments yet — be the first.</p>";
      return;
    }
    listEl.innerHTML = comments.map(function (c) {
      var when = new Date(c.date).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
      // name/text are already HTML-escaped server-side, but escaping again here
      // is free insurance against any future API change that stops doing so.
      return (
        '<div class="comment">' +
        '<div class="comment-meta"><span class="comment-name">' + escapeHtml(c.name) + '</span>' +
        '<span class="comment-date">' + when + "</span></div>" +
        '<p class="comment-text">' + escapeHtml(c.text) + "</p>" +
        "</div>"
      );
    }).join("");
  }

  function load() {
    listEl.innerHTML = "<p class=\"comment-empty\">Loading comments…</p>";
    fetch(api + "/api/comments?post=" + encodeURIComponent(post))
      .then(function (r) { return r.json(); })
      .then(function (data) { renderComments(data.comments || []); })
      .catch(function () { listEl.innerHTML = "<p class=\"comment-empty\">Couldn't load comments.</p>"; });
  }

  if (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var name = form.elements.name.value.trim();
      var text = form.elements.text.value.trim();
      var website = form.elements.website.value; // honeypot
      if (!name || !text) return;

      statusEl.textContent = "Posting…";
      fetch(api + "/api/comments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ post: post, name: name, text: text, website: website }),
      })
        .then(function (r) {
          if (!r.ok) return r.json().then(function (d) { throw new Error(d.error || "Failed to post comment"); });
          return r.json();
        })
        .then(function () {
          form.reset();
          statusEl.textContent = "";
          load();
        })
        .catch(function (err) {
          statusEl.textContent = err.message;
        });
    });
  }

  load();
})();
