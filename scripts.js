document.querySelectorAll('label.option').forEach(option => {
  option.addEventListener('click', function () {
    document.querySelectorAll('.option').forEach(opt => opt.classList.remove('active'));
    this.classList.add('active');
    document.getElementById(this.htmlFor).checked = true;
  });
});