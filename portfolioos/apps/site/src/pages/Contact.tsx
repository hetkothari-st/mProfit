import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FaqList } from '../components/Common';
import { pricingFaq } from '../data/content';
import { config } from '../lib/config';
import { sendMessage } from '../lib/contact';

const TOPICS = ['Account help', "I'm a CA or adviser", 'Feature request', 'Press', 'Security report'] as const;
const TOPIC_PARAM: Record<string, (typeof TOPICS)[number]> = { ca: "I'm a CA or adviser", security: 'Security report', help: 'Account help' };

type Errors = Partial<Record<'name' | 'email' | 'message', string>>;
type State = 'idle' | 'sending' | 'sent' | 'mailto' | 'error';

function validate(d: { name: string; email: string; message: string }): Errors {
  const e: Errors = {};
  if (!d.name.trim()) e.name = 'Enter your name.';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = 'Enter an email address like name@example.com.';
  if (d.message.trim().length < 10) e.message = 'Write a little more so we can help: at least 10 characters.';
  return e;
}

export default function Contact() {
  const [params] = useSearchParams();
  const [topic, setTopic] = useState<(typeof TOPICS)[number]>(TOPICS[0]);
  const [errors, setErrors] = useState<Errors>({});
  const [state, setState] = useState<State>('idle');
  const formRef = useRef<HTMLFormElement>(null);
  const noteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = TOPIC_PARAM[params.get('topic') ?? ''];
    if (t) setTopic(t);
  }, [params]);

  useEffect(() => {
    if (state === 'sent' || state === 'mailto') noteRef.current?.focus();
  }, [state]);

  const onSubmit = async (ev: FormEvent<HTMLFormElement>) => {
    ev.preventDefault();
    const f = new FormData(ev.currentTarget);
    const data = { name: String(f.get('name') ?? ''), email: String(f.get('email') ?? ''), message: String(f.get('message') ?? ''), topic };
    const errs = validate(data);
    setErrors(errs);
    const first = (['name', 'email', 'message'] as const).find((k) => errs[k]);
    if (first) {
      formRef.current?.querySelector<HTMLElement>(`[name="${first}"]`)?.focus();
      return;
    }
    setState('sending');
    const result = await sendMessage(data);
    setState(result);
  };

  const done = state === 'sent' || state === 'mailto';

  return (
    <>
      <section className="page-hero contact-hero">
        <div className="wrap contact-grid">
          <div>
            <h1 className="display">Write to us.</h1>
            <p className="lede">A real person reads every message. Tell us what you'd like to track, what's missing, or how your practice works, and we'll reply within two working days.</p>
            <ul className="contact-ways">
              <li><strong>Email</strong><a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a></li>
              <li><strong>CAs, advisers and family offices</strong><span>Choose "I'm a CA or adviser" and we'll set up a walkthrough of the client workspace.</span></li>
              <li><strong>Security</strong><span>Found a vulnerability? Choose "Security report" and include steps to reproduce. Please don't test against other people's accounts.</span></li>
            </ul>
          </div>

          <div className="letter-stage">
            {!done && (
              <form className={`contact-form${state === 'sending' ? ' is-sending' : ''}`} ref={formRef} onSubmit={onSubmit} noValidate>
                <div className="field">
                  <label htmlFor="c-name">Your name</label>
                  <input id="c-name" name="name" autoComplete="name" aria-invalid={!!errors.name} aria-describedby="c-name-err" />
                  <span className="err" id="c-name-err">{errors.name}</span>
                </div>
                <div className="field">
                  <label htmlFor="c-email">Email</label>
                  <input id="c-email" name="email" type="email" autoComplete="email" aria-invalid={!!errors.email} aria-describedby="c-email-err" />
                  <span className="err" id="c-email-err">{errors.email}</span>
                </div>
                <fieldset className="field">
                  <legend>This is about</legend>
                  <div className="radios">
                    {TOPICS.map((t) => (
                      <label key={t}>
                        <input type="radio" name="topic" value={t} checked={topic === t} onChange={() => setTopic(t)} />
                        <span>{t}</span>
                      </label>
                    ))}
                  </div>
                </fieldset>
                <div className="field">
                  <label htmlFor="c-msg">Message</label>
                  <textarea id="c-msg" name="message" aria-invalid={!!errors.message} aria-describedby="c-msg-hint c-msg-err" />
                  <span className="hint" id="c-msg-hint">Please don't include account numbers, PAN or passwords.</span>
                  <span className="err" id="c-msg-err">{errors.message}</span>
                </div>
                {state === 'error' && (
                  <p className="err" role="alert">The message didn't send. Try again, or email us at <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>.</p>
                )}
                <div><button className="btn btn-ink" type="submit" disabled={state === 'sending'}>{state === 'sending' ? 'Sending…' : 'Send message'}</button></div>
              </form>
            )}
            {done && (
              <div className="sent-note" ref={noteRef} tabIndex={-1} role="status">
                <div className="stamp cloth" lang="hi">शुभ</div>
                {state === 'sent' ? (
                  <>
                    <h2 className="h3">Message sent.</h2>
                    <p className="small">We'll reply to your email within two working days.</p>
                  </>
                ) : (
                  <>
                    <h2 className="h3">Your message is ready to send.</h2>
                    <p className="small">Your mail app has opened with it filled in. If it didn't, write to <a href={`mailto:${config.contactEmail}`}>{config.contactEmail}</a>.</p>
                  </>
                )}
                <button className="btn btn-line" type="button" onClick={() => setState('idle')}>Write another message</button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="section section-flush" aria-labelledby="cfaq-title">
        <div className="wrap">
          <div className="section-head"><h2 className="h2" id="cfaq-title">Before you write</h2></div>
          <FaqList items={pricingFaq} />
        </div>
      </section>
    </>
  );
}
