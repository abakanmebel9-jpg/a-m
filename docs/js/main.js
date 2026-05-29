(function() {
  'use strict';
  var savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
  var themeToggle = document.getElementById('themeToggle');
  if (themeToggle) {
    themeToggle.addEventListener('click', function() {
      var current = document.documentElement.getAttribute('data-theme');
      var next = current === 'dark' ? 'light' : 'dark';
      document.documentElement.setAttribute('data-theme', next);
      localStorage.setItem('theme', next);
    });
  }
  window.addEventListener('scroll', function() {
    var header = document.getElementById('header');
    var scrollProgress = document.getElementById('scrollProgress');
    var scrollToTop = document.getElementById('scrollToTop');
    if (window.scrollY > 50) { if (header) header.classList.add('scrolled'); }
    else { if (header) header.classList.remove('scrolled'); }
    var winScroll = document.body.scrollTop || document.documentElement.scrollTop;
    var height = document.documentElement.scrollHeight - document.documentElement.clientHeight;
    var scrolled = (winScroll / height) * 100;
    if (scrollProgress) scrollProgress.style.width = scrolled + '%';
    if (scrollToTop) {
      if (window.scrollY > 500) scrollToTop.classList.add('visible');
      else scrollToTop.classList.remove('visible');
    }
  });
  var scrollToTopBtn = document.getElementById('scrollToTop');
  if (scrollToTopBtn) {
    scrollToTopBtn.addEventListener('click', function() { window.scrollTo({ top: 0, behavior: 'smooth' }); });
  }
  // Video thumbnail click
  document.addEventListener('click', function(e) {
    var thumb = e.target.closest('.video-thumbnail');
    if (thumb) {
      var videoSrc = thumb.dataset.videoSrc;
      if (videoSrc) {
        var container = thumb.parentElement;
        container.innerHTML = '<video src="' + videoSrc + '" controls autoplay playsinline style="width:100%;max-height:600px"></video>';
      }
    }
  });

  window.initAbakanMebel = function(matrixKeywords) {
    var canvas = document.getElementById('matrix-bg');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    var columns = Math.floor(canvas.width / 20);
    var drops = [];
    for (var i = 0; i < columns; i++) drops[i] = 1;
    function draw() {
      ctx.fillStyle = 'rgba(15, 23, 42, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (var i = 0; i < drops.length; i++) {
        var text = matrixKeywords[Math.floor(Math.random() * matrixKeywords.length)];
        var x = i * 20;
        var y = drops[i] * 20;
        ctx.fillStyle = 'rgba(255, 255, 255, 0.7)';
        ctx.font = '12px monospace';
        ctx.fillText(text, x, y);
        if (y > canvas.height && Math.random() > 0.975) drops[i] = 0;
        drops[i]++;
      }
    }
    setInterval(draw, 120);
    window.addEventListener('resize', function() {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      columns = Math.floor(canvas.width / 20);
      drops = [];
      for (var i = 0; i < columns; i++) drops[i] = 1;
    });
  };

  function hashStr(str) {
    if (!str) return '0';
    var hash = 2166136261;
    for (var i = 0; i < str.length; i++) { hash ^= str.charCodeAt(i); hash = (hash * 16777619) >>> 0; }
    return hash.toString(36);
  }
})();