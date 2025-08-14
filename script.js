document.addEventListener("DOMContentLoaded", () => {
  const econList = document.getElementById("econList");
  const specialsList = document.getElementById("specials");
  const earningsBoard = document.getElementById("earningsBoard");

  const toggleNextWeek = document.getElementById("toggleNextWeek");
  const toggleEarningsWeek = document.getElementById("toggleEarningsWeek");

  function loadEconomicEvents() {
    fetch("economic.json")
      .then(res => res.json())
      .then(data => {
        econList.innerHTML = "";
        const now = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(now.getDate() + 7);

        data.forEach(event => {
          const eventDate = new Date(event.date);
          const isThisWeek = eventDate < nextWeek;
          if (!toggleNextWeek.checked && !isThisWeek) return;

          const li = document.createElement("li");
          li.className = "event";
          if (isToday(eventDate)) li.classList.add("today");
          else if (isTomorrow(eventDate)) li.classList.add("tomorrow");
          else if (eventDate < now) li.classList.add("past");

          li.innerHTML = `
            <div class="event-date">${event.date}</div>
            <div class="event-label">${event.name}</div>
            <div class="event-type">${event.type}</div>
          `;
          econList.appendChild(li);
        });
      });
  }

  function loadSpecials() {
    fetch("specials.json")
      .then(res => res.json())
      .then(data => {
        specialsList.innerHTML = "";
        const now = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(now.getDate() + 7);

        data.forEach(event => {
          const eventDate = new Date(event.date);
          const isThisWeek = eventDate < nextWeek;
          if (!toggleNextWeek.checked && !isThisWeek) return;

          const li = document.createElement("li");
          li.className = "event";
          if (isToday(eventDate)) li.classList.add("today");
          else if (isTomorrow(eventDate)) li.classList.add("tomorrow");
          else if (eventDate < now) li.classList.add("past");

          li.innerHTML = `
            <div class="event-date">${event.date}</div>
            <div class="event-label">${event.name}</div>
          `;
          specialsList.appendChild(li);
        });
      });
  }

  function loadEarnings() {
    fetch("earnings.json")
      .then(res => res.json())
      .then(data => {
        earningsBoard.innerHTML = "";
        const now = new Date();
        const nextWeek = new Date();
        nextWeek.setDate(now.getDate() + 7);

        Object.keys(data).forEach(ticker => {
          const section = document.createElement("section");
          section.className = "ticker";
          const title = document.createElement("h3");
          title.className = "ticker-title";
          title.textContent = ticker;
          section.appendChild(title);

          const ul = document.createElement("ul");
          ul.className = "event-list";

          data[ticker].forEach(ev => {
            const eventDate = new Date(ev.date);
            const isThisWeek = eventDate < nextWeek;
            if (!toggleEarningsWeek.checked && !isThisWeek) return;

            const li = document.createElement("li");
            li.className = "event";
            if (isToday(eventDate)) li.classList.add("today");
            else if (isTomorrow(eventDate)) li.classList.add("tomorrow");
            else if (eventDate < now) li.classList.add("past");

            li.innerHTML = `
              <div class="event-date">${ev.date}</div>
              <div class="event-label">${ev.type}</div>
            `;
            ul.appendChild(li);
          });

          section.appendChild(ul);
          earningsBoard.appendChild(section);
        });
      });
  }

  function isToday(date) {
    const today = new Date();
    return date.toDateString() === today.toDateString();
  }

  function isTomorrow(date) {
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    return date.toDateString() === tomorrow.toDateString();
  }

  toggleNextWeek.addEventListener("change", () => {
    loadEconomicEvents();
    loadSpecials();
  });

  toggleEarningsWeek.addEventListener("change", loadEarnings);

  loadEconomicEvents();
  loadSpecials();
  loadEarnings();
});
